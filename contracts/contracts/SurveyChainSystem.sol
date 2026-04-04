// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

contract SurveyChainSystem is VRFConsumerBaseV2Plus {

    // --- 結構定義 ---
    struct PoolA {
        string title;
        uint256 prizePool;
        uint256 maxWinners;
        uint256 deadline;
        address[] participants;
        mapping(address => bool) hasVoted;
        bool isDrawn;
    }

    struct PoolB {
        string question;
        uint8 optionCount;
        uint256 maxWinners;
        uint256 deadline;
        uint256 prizePool;
        address creator;
        address[] players;
        mapping(address => uint8) playerChoice;
        mapping(address => bool) hasBet;
        mapping(address => uint256) betAmount; // 記錄每人下注金額
        address[] correctPlayers;
        uint8 correctAnswer;
        bool isResolved;
        bool isDrawn;
    }

    // 方案B：中獎紀錄結構，供反查使用
    struct WinRecord {
        uint8 poolType;
        uint256 poolId;
    }

    // 將 Pool 資訊打包，避免 fulfillRandomWords stack too deep
    struct PoolInfo {
        address[] candidates;
        uint256 totalPrize;
        uint256 maxWinners;
    }

    // --- 狀態變數 ---
    mapping(uint256 => PoolA) public poolsA;
    mapping(uint256 => PoolB) public poolsB;
    uint256 public countA;
    uint256 public countB;

    // 領獎紀錄
    mapping(uint8 => mapping(uint256 => mapping(address => bool))) public isWinner;
    mapping(uint8 => mapping(uint256 => mapping(address => bool))) public hasClaimed;
    mapping(uint8 => mapping(uint256 => uint256)) public prizePerWinner;
    mapping(uint8 => mapping(uint256 => uint256)) public remainderPrize;

    // 反查 mapping，記錄每個地址中過哪些 Pool
    mapping(address => WinRecord[]) private userWins;

    // 追蹤已承諾但尚未被 claim 的總金額，withdrawETH 不得動用這部分
    uint256 public lockedPrize;

    // VRF 請求追蹤
    mapping(uint256 => uint8)   private requestToType;
    mapping(uint256 => uint256) private requestToId;
    mapping(uint256 => bool)    private requestExists; // 防止零值 key 靜默誤觸

    // Chainlink 設定 (Sepolia 測試網)
    uint256 public s_subscriptionId;
    bytes32 public keyHash = 0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae;

    // --- 事件 ---
    event PoolACreated(uint256 indexed id, string title, uint256 prizePool, uint256 deadline);
    event PoolBCreated(uint256 indexed id, string question, uint256 deadline);
    event DrawRequested(uint8 indexed poolType, uint256 indexed poolId, uint256 requestId);
    event WinnersSelected(uint8 indexed poolType, uint256 indexed poolId, uint256 winnerCount, uint256 prizePerWinner);
    event Claimed(uint8 indexed poolType, uint256 indexed poolId, address indexed winner, uint256 amount);
    event NoWinnersRefunded(uint256 indexed poolBId, address creator, uint256 amount);
    event OwnerWithdrawn(address indexed owner, uint256 amount);

    constructor(uint256 _subId) VRFConsumerBaseV2Plus(0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B) {
        s_subscriptionId = _subId;
    }

    // ================== Pool A: 投票抽獎 ==================

    function createPoolA(string memory _title, uint256 _maxW, uint256 _min) public payable {
        require(msg.value > 0, "Must provide prize");
        require(_maxW > 0, "maxWinners must > 0");
        require(_min > 0, "Duration must > 0");

        uint256 id = countA++;
        PoolA storage p = poolsA[id];
        p.title = _title;
        p.prizePool = msg.value;
        p.maxWinners = _maxW;
        p.deadline = block.timestamp + (_min * 1 minutes);

        emit PoolACreated(id, _title, msg.value, p.deadline);
    }

    function voteA(uint256 _id) public {
        PoolA storage p = poolsA[_id];
        require(block.timestamp < p.deadline, "Ended");
        require(!p.hasVoted[msg.sender], "Already voted");

        p.hasVoted[msg.sender] = true;
        p.participants.push(msg.sender);
    }

    function drawA(uint256 _id) public {
        PoolA storage p = poolsA[_id];
        require(block.timestamp >= p.deadline, "Not expired");
        require(!p.isDrawn, "Already drawn");
        require(p.participants.length > 0, "No participants");

        _sendVRFRequest(0, _id);
    }

    // ================== Pool B: 題目競猜 ==================

    function createPoolB(string memory _q, uint8 _optCount, uint256 _maxW, uint256 _min) public {
        require(_optCount >= 2 && _optCount <= 10, "Options must be 2~10");
        require(_maxW > 0, "maxWinners must > 0");
        require(_min > 0, "Duration must > 0");

        uint256 id = countB++;
        PoolB storage p = poolsB[id];
        p.question = _q;
        p.optionCount = _optCount;
        p.maxWinners = _maxW;
        p.deadline = block.timestamp + (_min * 1 minutes);
        p.creator = msg.sender;

        emit PoolBCreated(id, _q, p.deadline);
    }

    function betB(uint256 _id, uint8 _choice) public payable {
        PoolB storage p = poolsB[_id];
        require(msg.sender != p.creator, "Creator cannot bet");
        require(block.timestamp < p.deadline, "Closed");
        require(_choice < p.optionCount, "Invalid option");
        require(msg.value > 0, "Amount > 0");
        require(!p.hasBet[msg.sender], "Already bet");

        p.hasBet[msg.sender] = true;
        p.betAmount[msg.sender] = msg.value;
        p.playerChoice[msg.sender] = _choice;
        p.players.push(msg.sender);
        p.prizePool += msg.value;
    }

    function resolveAndDrawB(uint256 _id, uint8 _answer) public {
        PoolB storage p = poolsB[_id];
        require(msg.sender == p.creator, "Only creator");
        require(block.timestamp >= p.deadline, "Not expired");
        require(!p.isResolved, "Already resolved");
        require(_answer < p.optionCount, "Invalid answer");

        p.correctAnswer = _answer;
        p.isResolved = true;

        for (uint256 i = 0; i < p.players.length; i++) {
            address player = p.players[i];
            if (p.playerChoice[player] == _answer) {
                p.correctPlayers.push(player);
            }
        }

        // 無人答對則退款給創建者
        if (p.correctPlayers.length == 0) {
            p.isDrawn = true;
            uint256 refund = p.prizePool;
            p.prizePool = 0;
            (bool success, ) = payable(p.creator).call{value: refund}("");
            require(success, "Refund failed");
            emit NoWinnersRefunded(_id, p.creator, refund);
            return;
        }

        _sendVRFRequest(1, _id);
    }

    // ================== VRF 核心邏輯 ==================

    function _sendVRFRequest(uint8 _type, uint256 _id) internal {
        uint256 requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: keyHash,
                subId: s_subscriptionId,
                requestConfirmations: 3,
                callbackGasLimit: 100000,
                numWords: 1,
                extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: false}))
            })
        );

        requestToType[requestId] = _type;
        requestToId[requestId]   = _id;
        requestExists[requestId] = true;

        emit DrawRequested(_type, _id, requestId);
    }

    // 輔助函式：取出 Pool 資訊並標記 isDrawn
    // 獨立成函式以減少 fulfillRandomWords 的區域變數數量，解決 stack too deep
    function _getPoolInfo(uint8 _pType, uint256 _pId) private returns (PoolInfo memory info) {
        if (_pType == 0) {
            PoolA storage pA = poolsA[_pId];
            pA.isDrawn      = true;
            info.candidates = pA.participants;
            info.totalPrize = pA.prizePool;
            info.maxWinners = pA.maxWinners;
        } else {
            PoolB storage pB = poolsB[_pId];
            pB.isDrawn      = true;
            info.candidates = pB.correctPlayers;
            info.totalPrize = pB.prizePool;
            info.maxWinners = pB.maxWinners;
        }
    }

    // 輔助函式：Fisher-Yates Shuffle 抽籤並寫入中獎紀錄
    // 獨立成函式以減少 fulfillRandomWords 的區域變數數量，解決 stack too deep
    function _drawWinners(
        uint8   _pType,
        uint256 _pId,
        address[] memory _candidates,
        uint256 _actualWinnersCount,
        uint256 _seed
    ) private {
        for (uint256 i = 0; i < _actualWinnersCount; i++) {
            uint256 expandedRandom = uint256(keccak256(abi.encode(_seed, i)));
            uint256 remaining      = _candidates.length - i;
            uint256 winnerIndex    = expandedRandom % remaining;

            address winnerAddress  = _candidates[winnerIndex];
            isWinner[_pType][_pId][winnerAddress] = true;
            userWins[winnerAddress].push(WinRecord({ poolType: _pType, poolId: _pId }));

            // Fisher-Yates 去重交換（在 memory 副本上操作，不影響 storage 原始陣列）
            _candidates[winnerIndex] = _candidates[remaining - 1];
        }
    }

    function fulfillRandomWords(uint256 _requestId, uint256[] calldata _randomWords) internal override {
        require(requestExists[_requestId], "Unknown request");

        uint8   pType = requestToType[_requestId];
        uint256 pId   = requestToId[_requestId];

        // 提前清除請求紀錄，節省 Gas 並防止重入
        delete requestToType[_requestId];
        delete requestToId[_requestId];
        delete requestExists[_requestId];

        // 取出 Pool 資訊（同時標記 isDrawn）
        PoolInfo memory info = _getPoolInfo(pType, pId);

        if (info.candidates.length == 0) return;

        uint256 actualWinnersCount = info.maxWinners > info.candidates.length
            ? info.candidates.length
            : info.maxWinners;

        // 計算每人獎金與餘數
        prizePerWinner[pType][pId] = info.totalPrize / actualWinnersCount;
        remainderPrize[pType][pId] = info.totalPrize % actualWinnersCount;

        // Fisher-Yates Shuffle 抽籤
        _drawWinners(pType, pId, info.candidates, actualWinnersCount, _randomWords[0]);

        lockedPrize += info.totalPrize;

        emit WinnersSelected(pType, pId, actualWinnersCount, prizePerWinner[pType][pId]);
    }

    // ================== 自領模式 (Claim) ==================

    function claim(uint8 _type, uint256 _id) public {
        require(isWinner[_type][_id][msg.sender], "Not a winner");
        require(!hasClaimed[_type][_id][msg.sender], "Already claimed");

        hasClaimed[_type][_id][msg.sender] = true;

        uint256 amount = prizePerWinner[_type][_id];

        // 餘數由第一個 claim 的人領走，領完即清零
        uint256 bonus = remainderPrize[_type][_id];
        if (bonus > 0) {
            remainderPrize[_type][_id] = 0;
            amount += bonus;
        }

        lockedPrize -= amount; // [修正8]

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");

        emit Claimed(_type, _id, msg.sender, amount);
    }
	
	// 一次提領呼叫者所有尚未領取的獎金（不需要指定 Pool）
    function claimAll() external {
        WinRecord[] storage records = userWins[msg.sender];
        uint256 total = 0;

        for (uint256 i = 0; i < records.length; i++) {
            uint8   pType = records[i].poolType;
            uint256 pId   = records[i].poolId;

            if (hasClaimed[pType][pId][msg.sender]) continue;

            hasClaimed[pType][pId][msg.sender] = true;

            uint256 amount = prizePerWinner[pType][pId];

            uint256 bonus = remainderPrize[pType][pId];
            if (bonus > 0) {
                remainderPrize[pType][pId] = 0;
                amount += bonus;
            }

            lockedPrize -= amount;
            total += amount;

            emit Claimed(pType, pId, msg.sender, amount);
        }

        require(total > 0, "Nothing to claim");
        (bool success, ) = payable(msg.sender).call{value: total}("");
        require(success, "Transfer failed");
    }

    // ================== owner 提領 ==================

    function withdrawETH(uint256 amount) external onlyOwner {
        uint256 available = address(this).balance - lockedPrize;
        require(amount <= available, "Cannot withdraw locked prize");
        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Withdraw failed");
        emit OwnerWithdrawn(owner(), amount);
    }

    // ================== 查詢輔助 ==================

	// Pool A 參與人數
    function getPoolAParticipantCount(uint256 _id) external view returns (uint256) {
        return poolsA[_id].participants.length;
    }

	// Pool B 下注人數
    function getPoolBPlayerCount(uint256 _id) external view returns (uint256) {
        return poolsB[_id].players.length;
    }

	// Pool B 答對人數
    function getPoolBCorrectPlayerCount(uint256 _id) external view returns (uint256) {
        return poolsB[_id].correctPlayers.length;
    }

    // 查詢呼叫者所有尚未領取的獎金總額
    function getPendingPrize() external view returns (uint256 total) {
        WinRecord[] storage records = userWins[msg.sender];
        for (uint256 i = 0; i < records.length; i++) {
            uint8   pType = records[i].poolType;
            uint256 pId   = records[i].poolId;
            if (hasClaimed[pType][pId][msg.sender]) continue;
            total += prizePerWinner[pType][pId];
            // 注意：remainderPrize 為先到先得，此處不計入以免高估
        }
    }
}
