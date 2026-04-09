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
        bool exists;
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
        mapping(address => uint256) betAmount;
        address[] correctPlayers;
        uint8 correctAnswer;
        bool isResolved;
        bool isDrawn;
        bool refundMode;
        bool exists;
    }

    // 中獎紀錄結構，供反查使用
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

    struct VRFRequest {
        uint8 poolType;
        uint256 poolId;
        bool exists;
    }

    // Pool A 基本資訊（供前端查詢，略過含 mapping 的欄位）
    struct PoolAInfo {
        string title;
        uint256 prizePool;
        uint256 maxWinners;
        uint256 deadline;
        uint256 participantCount;   // Pool A 參與人數
        bool isDrawn;
    }

    // Pool B 基本資訊（供前端查詢）
    struct PoolBInfo {
        string question;
        uint8 optionCount;
        uint256 maxWinners;
        uint256 deadline;
        uint256 prizePool;
        address creator;
        uint256 playerCount;        // Pool B 下注人數
        uint256 correctPlayerCount; // Pool B 答對人數
        uint8 correctAnswer;
        bool isResolved;
        bool isDrawn;
        bool refundMode;
    }

    // --- 狀態變數 ---
    mapping(uint256 => PoolA) public poolsA;
    mapping(uint256 => PoolB) public poolsB;

    // 從 1 開始計數，避免 id=0 與「未設定」混淆，與後端 DB autoIncrement 一致
    uint256 public countA = 1;
    uint256 public countB = 1;

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
    mapping(uint256 => VRFRequest) private vrfRequests;

    // Pool B 退款金額紀錄（無人答對 或 creator timeout 時使用）
    mapping(uint256 => mapping(address => uint256)) public poolBRefundAmount;

    // Chainlink 設定 (Sepolia 測試網)
    uint256 public s_subscriptionId;
    bytes32 public keyHash = 0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae;

    // creator 逾期未解答的 timeout 天數
    uint256 public constant RESOLVE_TIMEOUT = 60 days;

    // --- 事件 ---
    event PoolACreated(uint256 indexed id, string title, uint256 prizePool, uint256 deadline);
    event PoolBCreated(uint256 indexed id, string question, uint256 deadline);
    event DrawRequested(uint8 indexed poolType, uint256 indexed poolId, uint256 requestId);
    event WinnersSelected(uint8 indexed poolType, uint256 indexed poolId, uint256 winnerCount, uint256 prizePerWinner);
    event Claimed(uint8 indexed poolType, uint256 indexed poolId, address indexed winner, uint256 amount);
    event PoolBRefundEnabled(uint256 indexed poolBId, uint256 totalRefund, bool isTimeout);
    event PoolBRefundClaimed(uint256 indexed poolBId, address indexed player, uint256 amount);
    event OwnerWithdrawn(address indexed owner, uint256 amount);

    constructor(uint256 _subId) VRFConsumerBaseV2Plus(0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B) {
        s_subscriptionId = _subId;
    }

    // ================== Pool A: 投票抽獎 ==================

    function createPoolA(string memory _title, uint256 _maxW, uint256 _min) public payable {
        require(msg.value > 0, "Must provide prize");
        require(_maxW > 0, "maxWinners must > 0");
        require(_min > 0, "Duration must > 0");

        uint256 id = countA;
        countA++;

        PoolA storage p = poolsA[id];
        p.title = _title;
        p.prizePool = msg.value;
        p.maxWinners = _maxW;
        p.deadline = block.timestamp + (_min * 1 minutes);
        p.exists = true;

        emit PoolACreated(id, _title, msg.value, p.deadline);
    }

    function voteA(uint256 _id) public {
        PoolA storage p = poolsA[_id];
        require(p.exists, "Pool does not exist");
        require(block.timestamp < p.deadline, "Ended");
        require(!p.hasVoted[msg.sender], "Already voted");

        p.hasVoted[msg.sender] = true;
        p.participants.push(msg.sender);
    }

    function drawA(uint256 _id) public {
        PoolA storage p = poolsA[_id];
        require(p.exists, "Pool does not exist");
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

        uint256 id = countB;
        countB++;

        PoolB storage p = poolsB[id];
        p.question = _q;
        p.optionCount = _optCount;
        p.maxWinners = _maxW;
        p.deadline = block.timestamp + (_min * 1 minutes);
        p.creator = msg.sender;
        p.exists = true;

        emit PoolBCreated(id, _q, p.deadline);
    }

    function betB(uint256 _id, uint8 _choice) public payable {
        PoolB storage p = poolsB[_id];
        require(p.exists, "Pool does not exist");
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
        require(p.exists, "Pool does not exist");
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

        if (p.correctPlayers.length == 0) {
            // 呼叫共用內部函式啟用退款模式
            _enableRefundMode(_id, p, false);
            return;
        }

        _sendVRFRequest(1, _id);
    }

    // creator 超過 60 天未解答時，任何人可觸發退款給各玩家
    function triggerTimeoutRefundB(uint256 _id) public {
        PoolB storage p = poolsB[_id];
        require(p.exists, "Pool does not exist");
        require(!p.isResolved, "Already resolved");
        require(block.timestamp >= p.deadline + RESOLVE_TIMEOUT, "Timeout not reached");
        require(p.players.length > 0, "No players to refund");

        p.isResolved = true;

        // 呼叫共用內部函式啟用退款模式
        _enableRefundMode(_id, p, true);
    }

    // [整合D] 共用內部函式：啟用退款模式，將各玩家下注金額寫入退款紀錄
    function _enableRefundMode(uint256 _id, PoolB storage p, bool isTimeout) internal {
        p.isDrawn = true;
        p.refundMode = true;
        p.prizePool = 0;

        uint256 totalRefund = 0;
        for (uint256 i = 0; i < p.players.length; i++) {
            address player = p.players[i];
            uint256 refund = p.betAmount[player];
            poolBRefundAmount[_id][player] = refund;
            lockedPrize += refund;
            totalRefund += refund;
        }

        // 統一事件，以 isTimeout 區分觸發原因
        emit PoolBRefundEnabled(_id, totalRefund, isTimeout);
    }

    // 玩家在退款模式下領回自己的下注金額
    function claimPoolBRefund(uint256 _id) public {
        require(poolsB[_id].refundMode, "Not in refund mode");
        uint256 refund = poolBRefundAmount[_id][msg.sender];
        require(refund > 0, "Nothing to refund");

        poolBRefundAmount[_id][msg.sender] = 0;
        lockedPrize -= refund;

        (bool success, ) = payable(msg.sender).call{value: refund}("");
        require(success, "Refund failed");

        emit PoolBRefundClaimed(_id, msg.sender, refund);
    }

    // ================== VRF 核心邏輯 ==================

    function _sendVRFRequest(uint8 _type, uint256 _id) internal {
        uint256 requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: keyHash,
                subId: s_subscriptionId,
                requestConfirmations: 3,
                callbackGasLimit: 250000,
                numWords: 1,
                extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: false}))
            })
        );

        vrfRequests[requestId] = VRFRequest({ poolType: _type, poolId: _id, exists: true });

        emit DrawRequested(_type, _id, requestId);
    }

    // 輔助函式：取出 Pool 資訊並標記 isDrawn
    function _getPoolInfo(uint8 _pType, uint256 _pId) private returns (PoolInfo memory info) {
        if (_pType == 0) {
            PoolA storage pA = poolsA[_pId];
            pA.isDrawn      = true;
            info.totalPrize = pA.prizePool;
            info.maxWinners = pA.maxWinners;
            uint256 len = pA.participants.length;
            info.candidates = new address[](len);
            for (uint256 i = 0; i < len; i++) {
                info.candidates[i] = pA.participants[i];
            }
        } else {
            PoolB storage pB = poolsB[_pId];
            pB.isDrawn      = true;
            info.totalPrize = pB.prizePool;
            info.maxWinners = pB.maxWinners;
            uint256 len = pB.correctPlayers.length;
            info.candidates = new address[](len);
            for (uint256 i = 0; i < len; i++) {
                info.candidates[i] = pB.correctPlayers[i];
            }
        }
    }

    // 輔助函式：Fisher-Yates Shuffle 抽籤並寫入中獎紀錄
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
        VRFRequest memory req = vrfRequests[_requestId];
        require(req.exists, "Unknown request");

        // 提前清除請求紀錄，節省 Gas 並防止重入
        delete vrfRequests[_requestId];

        // 取出 Pool 資訊（同時標記 isDrawn）
        PoolInfo memory info = _getPoolInfo(req.poolType, req.poolId);

        if (info.candidates.length == 0) return;

        uint256 actualWinnersCount = info.maxWinners > info.candidates.length
            ? info.candidates.length
            : info.maxWinners;

        // 計算每人獎金與餘數
        prizePerWinner[req.poolType][req.poolId] = info.totalPrize / actualWinnersCount;
        remainderPrize[req.poolType][req.poolId] = info.totalPrize % actualWinnersCount;

        // Fisher-Yates Shuffle 抽籤
        _drawWinners(req.poolType, req.poolId, info.candidates, actualWinnersCount, _randomWords[0]);

        lockedPrize += info.totalPrize;

        emit WinnersSelected(req.poolType, req.poolId, actualWinnersCount, prizePerWinner[req.poolType][req.poolId]);
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

        lockedPrize -= amount;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");

        emit Claimed(_type, _id, msg.sender, amount);
    }

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
        }

        require(total > 0, "Nothing to claim");

        (bool success, ) = payable(msg.sender).call{value: total}("");
        require(success, "Transfer failed");

        for (uint256 i = 0; i < records.length; i++) {
            uint8   pType = records[i].poolType;
            uint256 pId   = records[i].poolId;
            if (!hasClaimed[pType][pId][msg.sender]) continue;
            emit Claimed(pType, pId, msg.sender, prizePerWinner[pType][pId]);
        }
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

    function getPoolAInfo(uint256 _id) external view returns (PoolAInfo memory) {
        PoolA storage p = poolsA[_id];
        require(p.exists, "Pool does not exist");
        return PoolAInfo({
            title:            p.title,
            prizePool:        p.prizePool,
            maxWinners:       p.maxWinners,
            deadline:         p.deadline,
            participantCount: p.participants.length,
            isDrawn:          p.isDrawn
        });
    }

    function getPoolBInfo(uint256 _id) external view returns (PoolBInfo memory) {
        PoolB storage p = poolsB[_id];
        require(p.exists, "Pool does not exist");
        return PoolBInfo({
            question:           p.question,
            optionCount:        p.optionCount,
            maxWinners:         p.maxWinners,
            deadline:           p.deadline,
            prizePool:          p.prizePool,
            creator:            p.creator,
            playerCount:        p.players.length,
            correctPlayerCount: p.correctPlayers.length,
            correctAnswer:      p.correctAnswer,
            isResolved:         p.isResolved,
            isDrawn:            p.isDrawn,
            refundMode:         p.refundMode
        });
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

    // 查詢特定地址是否已參與 Pool A（前端可用）
    function hasVotedA(uint256 _id, address _user) external view returns (bool) {
        return poolsA[_id].hasVoted[_user];
    }

    // 查詢特定地址是否已下注 Pool B（前端可用）
    function hasBetB(uint256 _id, address _user) external view returns (bool) {
        return poolsB[_id].hasBet[_user];
    }

    // 查詢玩家在特定 Pool B 的可退款金額
    function getPoolBRefundAmount(uint256 _id) external view returns (uint256) {
        return poolBRefundAmount[_id][msg.sender];
    }
}
