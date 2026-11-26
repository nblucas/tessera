// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract TesseraLedger is EIP712 {
    // ---------------------------------------------------------------------------------------
    // Signed messages
    // ---------------------------------------------------------------------------------------
    // Field names, types and order must match shared/src/eip712.ts, or the app's signatures
    // will recover to a different address. The first four fields are the same in every
    // message.

    struct HandoverProposedMessage {
        address actor;
        uint256 nonce;
        uint256 deadline;
        string association;
        string handoverId;
        address[] members;
    }

    struct HandoverApprovedMessage {
        address actor;
        uint256 nonce;
        uint256 deadline;
        string association;
        string handoverId;
    }

    struct HandoverCancelledMessage {
        address actor;
        uint256 nonce;
        uint256 deadline;
        string association;
        string handoverId;
    }

    // Used for both BatchCreated and BatchUpdated, which have the same fields.
    struct BatchMessage {
        address actor;
        uint256 nonce;
        uint256 deadline;
        string association;
        string eventId;
        string batchId;
        uint256 priceCents;
        uint256 quantity;
        uint256 resaleCapPercent;
    }

    struct BatchRemovedMessage {
        address actor;
        uint256 nonce;
        uint256 deadline;
        string association;
        string eventId;
        string batchId;
    }

    struct TicketIssuedMessage {
        address actor;
        uint256 nonce;
        uint256 deadline;
        string association;
        string ticketId;
        string eventId;
        string batchId;
        address owner;
        uint256 priceCents;
        string orderRef;
        bytes32 paymentRef;
    }

    struct PaymentRefundedMessage {
        address actor;
        uint256 nonce;
        uint256 deadline;
        string association;
        bytes32 paymentRef;
        uint256 amountCents;
        string orderRef;
        string reason;
    }

    struct PaymentReversedMessage {
        address actor;
        uint256 nonce;
        uint256 deadline;
        string association;
        bytes32 paymentRef;
        string ticketId;
        uint256 amountCents;
    }

    struct TicketListedMessage {
        address actor;
        uint256 nonce;
        uint256 deadline;
        string association;
        string ticketId;
        uint256 priceCents;
    }

    struct ListingCancelledMessage {
        address actor;
        uint256 nonce;
        uint256 deadline;
        string association;
        string ticketId;
    }

    struct ResaleSettledMessage {
        address actor;
        uint256 nonce;
        uint256 deadline;
        string association;
        bytes32 paymentRef;
        string listedTicketId;
        string ticketId;
        address owner;
        uint256 priceCents;
        uint256 royaltyCents;
        uint256 platformFeeCents;
        uint256 payoutCents;
        string orderRef;
    }

    struct OracleChangeProposedMessage {
        address actor;
        uint256 nonce;
        uint256 deadline;
        string association;
        string proposalId;
        address newOracle;
    }

    // Used for OracleChangeApproved and OracleChangeCancelled, which have the same fields.
    struct OracleChangeMessage {
        address actor;
        uint256 nonce;
        uint256 deadline;
        string association;
        string proposalId;
    }

    struct ExpenseProposedMessage {
        address actor;
        uint256 nonce;
        uint256 deadline;
        string association;
        string expenseId;
        uint256 amountCents;
        string category;
        // Empty for a general expense not tied to an event.
        string eventId;
        bytes32 receiptSha256;
    }

    struct ExpenseVotedMessage {
        address actor;
        uint256 nonce;
        uint256 deadline;
        string association;
        string expenseId;
        bool approve;
    }

    bytes32 private constant HANDOVER_PROPOSED_TYPEHASH =
        keccak256(
            "HandoverProposed(address actor,uint256 nonce,uint256 deadline,string association,string handoverId,address[] members)"
        );
    bytes32 private constant HANDOVER_APPROVED_TYPEHASH =
        keccak256(
            "HandoverApproved(address actor,uint256 nonce,uint256 deadline,string association,string handoverId)"
        );
    bytes32 private constant HANDOVER_CANCELLED_TYPEHASH =
        keccak256(
            "HandoverCancelled(address actor,uint256 nonce,uint256 deadline,string association,string handoverId)"
        );
    bytes32 private constant BATCH_CREATED_TYPEHASH =
        keccak256(
            "BatchCreated(address actor,uint256 nonce,uint256 deadline,string association,string eventId,string batchId,uint256 priceCents,uint256 quantity,uint256 resaleCapPercent)"
        );
    bytes32 private constant BATCH_UPDATED_TYPEHASH =
        keccak256(
            "BatchUpdated(address actor,uint256 nonce,uint256 deadline,string association,string eventId,string batchId,uint256 priceCents,uint256 quantity,uint256 resaleCapPercent)"
        );
    bytes32 private constant BATCH_REMOVED_TYPEHASH =
        keccak256(
            "BatchRemoved(address actor,uint256 nonce,uint256 deadline,string association,string eventId,string batchId)"
        );
    bytes32 private constant TICKET_ISSUED_TYPEHASH =
        keccak256(
            "TicketIssued(address actor,uint256 nonce,uint256 deadline,string association,string ticketId,string eventId,string batchId,address owner,uint256 priceCents,string orderRef,bytes32 paymentRef)"
        );
    bytes32 private constant EXPENSE_PROPOSED_TYPEHASH =
        keccak256(
            "ExpenseProposed(address actor,uint256 nonce,uint256 deadline,string association,string expenseId,uint256 amountCents,string category,string eventId,bytes32 receiptSha256)"
        );
    bytes32 private constant EXPENSE_VOTED_TYPEHASH =
        keccak256(
            "ExpenseVoted(address actor,uint256 nonce,uint256 deadline,string association,string expenseId,bool approve)"
        );

    bytes32 private constant PAYMENT_REFUNDED_TYPEHASH =
        keccak256(
            "PaymentRefunded(address actor,uint256 nonce,uint256 deadline,string association,bytes32 paymentRef,uint256 amountCents,string orderRef,string reason)"
        );
    bytes32 private constant PAYMENT_REVERSED_TYPEHASH =
        keccak256(
            "PaymentReversed(address actor,uint256 nonce,uint256 deadline,string association,bytes32 paymentRef,string ticketId,uint256 amountCents)"
        );
    bytes32 private constant TICKET_LISTED_TYPEHASH =
        keccak256(
            "TicketListed(address actor,uint256 nonce,uint256 deadline,string association,string ticketId,uint256 priceCents)"
        );
    bytes32 private constant LISTING_CANCELLED_TYPEHASH =
        keccak256("ListingCancelled(address actor,uint256 nonce,uint256 deadline,string association,string ticketId)");
    bytes32 private constant RESALE_SETTLED_TYPEHASH =
        keccak256(
            "ResaleSettled(address actor,uint256 nonce,uint256 deadline,string association,bytes32 paymentRef,string listedTicketId,string ticketId,address owner,uint256 priceCents,uint256 royaltyCents,uint256 platformFeeCents,uint256 payoutCents,string orderRef)"
        );
    bytes32 private constant ORACLE_CHANGE_PROPOSED_TYPEHASH =
        keccak256(
            "OracleChangeProposed(address actor,uint256 nonce,uint256 deadline,string association,string proposalId,address newOracle)"
        );
    bytes32 private constant ORACLE_CHANGE_APPROVED_TYPEHASH =
        keccak256("OracleChangeApproved(address actor,uint256 nonce,uint256 deadline,string association,string proposalId)");
    bytes32 private constant ORACLE_CHANGE_CANCELLED_TYPEHASH =
        keccak256("OracleChangeCancelled(address actor,uint256 nonce,uint256 deadline,string association,string proposalId)");

    // Resale split, the same as RESALE_ROYALTY_PERCENT and RESALE_PLATFORM_FEE_PERCENT in
    // shared/src/records.ts.
    uint256 public constant RESALE_ROYALTY_PERCENT = 10;
    uint256 public constant RESALE_PLATFORM_FEE_PERCENT = 5;

    // The backend and the app read amounts as JavaScript numbers, which lose precision above
    // this value.
    uint256 public constant MAX_SAFE_INTEGER = 2 ** 53 - 1;

    // ---------------------------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------------------------

    struct Handover {
        string id;
        address proposer;
        address[] members;
        uint256 approvalCount;
        bool open;
    }

    struct Batch {
        bool exists;
        uint256 priceCents;
        uint256 quantity;
        uint256 sold;
        uint256 resaleCapPercent;
    }

    // Valid: can enter or be listed. Listed: offered for resale. Resold: replaced by the
    // buyer's ticket. Revoked: its payment was reversed.
    enum TicketStatus {
        None,
        Valid,
        Listed,
        Resold,
        Revoked
    }

    struct Ticket {
        TicketStatus status;
        bytes32 batch;
        address owner;
        bytes32 paymentRef;
        uint256 listingPriceCents;
    }

    // What became of each payment the oracle reported. One payment, one outcome.
    enum PaymentOutcome {
        None,
        Ticket,
        Refunded,
        Reversed
    }

    struct OracleChange {
        string id;
        address proposer;
        address newOracle;
        uint256 approvalCount;
        bool open;
    }

    enum ExpenseStatus {
        Pending,
        Approved,
        Rejected
    }

    struct Expense {
        bool exists;
        string id;
        address proposer;
        uint256 amountCents;
        ExpenseStatus status;
        // Every vote ever cast, including those of former directors. Only votes from the
        // current board count toward the status.
        address[] approvals;
        address[] rejections;
    }

    // May write the genesis records, and only before any signed action. With the backend this
    // is the relayer, so the backend seed writes the genesis through its ledger adapter.
    address public immutable genesisAuthority;
    // The payment oracle: the one address trusted to report off-chain Pix payments (tickets,
    // refunds, reversals and resales). Set at deploy time; a board majority can replace it.
    address public oracle;
    string public association;
    bytes32 private immutable associationHash;

    // Becomes true with the first signed action. Genesis records are refused after that.
    bool public genesisClosed;

    // Each board is a numbered term. Term 0 means no board yet.
    uint256 public term;
    mapping(uint256 term => address[]) private boards;
    mapping(uint256 term => mapping(address => bool)) private isMemberInTerm;

    // Next nonce each address must sign with. Stops the same action being sent twice.
    mapping(address => uint256) public nonces;

    Handover private handover;
    // Bumped on every proposal, so approvals from an earlier proposal do not carry over.
    uint256 private handoverRound;
    mapping(uint256 round => mapping(address => bool)) private approvedInRound;

    // Keyed by batchKey(eventId, batchId).
    mapping(bytes32 => Batch) private batches;
    // Keyed by keccak256(ticketId).
    mapping(bytes32 => Ticket) private tickets;
    // Keyed by the payment reference: SHA-256 of the Pix end-to-end id.
    mapping(bytes32 => PaymentOutcome) public payments;

    OracleChange private oracleChange;
    uint256 private oracleChangeRound;
    mapping(uint256 round => mapping(address => bool)) private approvedOracleChange;

    // Keyed by keccak256(expenseId).
    mapping(bytes32 => Expense) private expenses;
    mapping(bytes32 => mapping(address => bool)) private hasVoted;
    // Expenses that may still be pending, recounted on every handover. Expenses decided by a
    // vote are dropped from it at the next recount.
    bytes32[] private pendingExpenses;

    // ---------------------------------------------------------------------------------------
    // Events (read by the backend's indexer)
    // ---------------------------------------------------------------------------------------
    // Each record event has the same name and field names as the backend's ledger record
    // (shared/src/records.ts), so an event maps to a record field by field. `actor` is the
    // signer, and address(0) on genesis records, which nobody signs.

    event BoardSet(address[] members);
    event HandoverProposed(address indexed actor, string handoverId, address[] members);
    event HandoverApproved(address indexed actor, string handoverId);
    event HandoverCancelled(address indexed actor, string handoverId);
    event BatchCreated(
        address indexed actor,
        string eventId,
        string batchId,
        uint256 priceCents,
        uint256 quantity,
        uint256 resaleCapPercent
    );
    event BatchUpdated(
        address indexed actor,
        string eventId,
        string batchId,
        uint256 priceCents,
        uint256 quantity,
        uint256 resaleCapPercent
    );
    event BatchRemoved(address indexed actor, string eventId, string batchId);
    event OpeningSalesRecorded(string eventId, string batchId, uint256 count, uint256 amountCents);
    event TicketIssued(
        address indexed actor,
        string ticketId,
        string eventId,
        string batchId,
        address indexed owner,
        uint256 priceCents,
        string orderRef,
        bytes32 paymentRef
    );
    event PaymentRefunded(address indexed actor, bytes32 paymentRef, uint256 amountCents, string orderRef, string reason);
    event PaymentReversed(address indexed actor, bytes32 paymentRef, string ticketId, uint256 amountCents);
    event TicketListed(address indexed actor, string ticketId, uint256 priceCents);
    event ListingCancelled(address indexed actor, string ticketId);
    event ResaleSettled(
        address indexed actor,
        bytes32 paymentRef,
        string listedTicketId,
        string ticketId,
        address indexed owner,
        uint256 priceCents,
        uint256 royaltyCents,
        uint256 platformFeeCents,
        uint256 payoutCents,
        string orderRef
    );
    event OracleChangeProposed(address indexed actor, string proposalId, address newOracle);
    event OracleChangeApproved(address indexed actor, string proposalId);
    event OracleChangeCancelled(address indexed actor, string proposalId);
    event ExpenseProposed(
        address indexed actor,
        string expenseId,
        uint256 amountCents,
        string category,
        string eventId,
        bytes32 receiptSha256
    );
    event ExpenseVoted(address indexed actor, string expenseId, bool approve);

    // Not records: conveniences for readers. The backend's indexer works these out itself.
    event TermStarted(uint256 indexed term, address[] members);
    // Emitted when an expense leaves Pending, after a vote or a handover recount.
    event ExpenseDecided(string expenseId, ExpenseStatus status);
    // Emitted when a board majority puts a new oracle in office.
    event OracleChanged(address newOracle);

    // ---------------------------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------------------------

    error BadSignature();
    error DeadlineExpired();
    error BadNonce(uint256 expected);
    error WrongAssociation();
    error NotGenesisAuthority();
    error GenesisClosed();
    error BoardAlreadySet();
    error EmptyBoard();
    error DuplicateDirector(address director);
    error NotBoardMember(address actor);
    error HandoverAlreadyOpen();
    error NoOpenHandoverWithThisId();
    error AlreadyApproved();
    error OnlyProposerCanCancel();
    error InvalidPrice();
    error InvalidQuantity();
    error InvalidCount();
    error InvalidAmount();
    error BatchAlreadyExists();
    error UnknownBatch();
    error BatchFrozen();
    error OpeningSalesExceedQuantity();
    error OnlyOracle();
    error TicketAlreadyIssued();
    error BatchSoldOut();
    error PriceMismatch();
    error ExpenseAlreadyExists();
    error UnknownCategory();
    error UnknownExpense();
    error ExpenseNotPending();
    error AlreadyVoted();
    error InvalidResaleCap();
    error OnlyOracleReports();
    error InvalidPaymentRef();
    error PaymentAlreadyReported();
    error PaymentAlreadyReversed();
    error UnknownTicket();
    error PaymentDoesNotMatchTicket();
    error TicketNotValid();
    error TicketNotValidForResale();
    error OnlyOwnerLists();
    error OnlyOwnerCancels();
    error AboveResaleCap(uint256 maxPriceCents);
    error TicketNotListed();
    error OwnListing();
    error ListedPriceMismatch();
    error ResaleSplitMismatch();
    error OracleChangeAlreadyOpen();
    error AlreadyOracle();
    error NoOpenOracleChangeWithThisId();

    constructor(
        string memory association_,
        address oracle_,
        address genesisAuthority_
    ) EIP712("Tessera", "1") {
        genesisAuthority = genesisAuthority_;
        oracle = oracle_;
        association = association_;
        associationHash = keccak256(bytes(association_));
    }

    // ---------------------------------------------------------------------------------------
    // Genesis (deployer only, before any signed action)
    // ---------------------------------------------------------------------------------------

    function setBoard(address[] calldata members) external {
        _requireGenesis();
        if (term != 0) revert BoardAlreadySet();
        _checkNewBoard(members);

        emit BoardSet(members);
        _startTerm(members);
    }

    function createGenesisBatch(
        string calldata eventId,
        string calldata batchId,
        uint256 priceCents,
        uint256 quantity,
        uint256 resaleCapPercent
    ) external {
        _requireGenesis();
        _createBatch(address(0), eventId, batchId, priceCents, quantity, resaleCapPercent);
    }

    // Sales made before the app existed, labelled as imported.
    function recordOpeningSales(
        string calldata eventId,
        string calldata batchId,
        uint256 count,
        uint256 amountCents
    ) external {
        _requireGenesis();
        Batch storage batch = _existingBatch(eventId, batchId);
        if (count == 0 || count > MAX_SAFE_INTEGER) revert InvalidCount();
        if (amountCents > MAX_SAFE_INTEGER) revert InvalidAmount();
        if (batch.sold + count > batch.quantity) revert OpeningSalesExceedQuantity();

        batch.sold += count;
        emit OpeningSalesRecorded(eventId, batchId, count, amountCents);
    }

    // ---------------------------------------------------------------------------------------
    // Board handover
    // ---------------------------------------------------------------------------------------

    function proposeHandover(
        HandoverProposedMessage calldata message,
        bytes calldata signature
    ) external {
        _verify(_hashHandoverProposed(message), message.actor, message.nonce, message.deadline, message.association, signature);
        _requireBoardMember(message.actor);
        if (handover.open) revert HandoverAlreadyOpen();
        _checkNewBoard(message.members);

        handoverRound += 1;
        handover.id = message.handoverId;
        handover.proposer = message.actor;
        handover.members = message.members;
        handover.approvalCount = 0;
        handover.open = true;

        emit HandoverProposed(message.actor, message.handoverId, message.members);
        // Proposing counts as the proposer's approval.
        _approveHandover(message.actor);
    }

    function approveHandover(
        HandoverApprovedMessage calldata message,
        bytes calldata signature
    ) external {
        _verify(_hashHandoverApproved(message), message.actor, message.nonce, message.deadline, message.association, signature);
        _requireBoardMember(message.actor);
        _requireOpenHandover(message.handoverId);
        if (approvedInRound[handoverRound][message.actor]) revert AlreadyApproved();

        emit HandoverApproved(message.actor, message.handoverId);
        _approveHandover(message.actor);
    }

    function cancelHandover(
        HandoverCancelledMessage calldata message,
        bytes calldata signature
    ) external {
        _verify(_hashHandoverCancelled(message), message.actor, message.nonce, message.deadline, message.association, signature);
        _requireOpenHandover(message.handoverId);
        if (message.actor != handover.proposer) revert OnlyProposerCanCancel();

        delete handover;
        emit HandoverCancelled(message.actor, message.handoverId);
    }

    // ---------------------------------------------------------------------------------------
    // Batches
    // ---------------------------------------------------------------------------------------

    function createBatch(BatchMessage calldata message, bytes calldata signature) external {
        _verify(_hashBatch(BATCH_CREATED_TYPEHASH, message), message.actor, message.nonce, message.deadline, message.association, signature);
        _requireBoardMember(message.actor);
        _createBatch(
            message.actor,
            message.eventId,
            message.batchId,
            message.priceCents,
            message.quantity,
            message.resaleCapPercent
        );
    }

    function updateBatch(BatchMessage calldata message, bytes calldata signature) external {
        _verify(_hashBatch(BATCH_UPDATED_TYPEHASH, message), message.actor, message.nonce, message.deadline, message.association, signature);
        _requireBoardMember(message.actor);
        Batch storage batch = _existingBatch(message.eventId, message.batchId);
        if (batch.sold > 0) revert BatchFrozen();
        _checkBatchFields(message.priceCents, message.quantity, message.resaleCapPercent);

        batch.priceCents = message.priceCents;
        batch.quantity = message.quantity;
        batch.resaleCapPercent = message.resaleCapPercent;
        emit BatchUpdated(
            message.actor,
            message.eventId,
            message.batchId,
            message.priceCents,
            message.quantity,
            message.resaleCapPercent
        );
    }

    function removeBatch(BatchRemovedMessage calldata message, bytes calldata signature) external {
        _verify(_hashBatchRemoved(message), message.actor, message.nonce, message.deadline, message.association, signature);
        _requireBoardMember(message.actor);
        Batch storage batch = _existingBatch(message.eventId, message.batchId);
        if (batch.sold > 0) revert BatchFrozen();

        delete batches[batchKey(message.eventId, message.batchId)];
        emit BatchRemoved(message.actor, message.eventId, message.batchId);
    }

    // ---------------------------------------------------------------------------------------
    // Tickets (payment oracle only)
    // ---------------------------------------------------------------------------------------
    // Income is not stored separately: it is the sum of issued tickets, so the two can never
    // disagree.

    function issueTicket(TicketIssuedMessage calldata message, bytes calldata signature) external {
        _verify(_hashTicketIssued(message), message.actor, message.nonce, message.deadline, message.association, signature);
        if (message.actor != oracle) revert OnlyOracle();
        bytes32 ticketKey = keccak256(bytes(message.ticketId));
        if (tickets[ticketKey].status != TicketStatus.None) revert TicketAlreadyIssued();
        _requireNewPayment(message.paymentRef);
        Batch storage batch = _existingBatch(message.eventId, message.batchId);
        if (batch.sold >= batch.quantity) revert BatchSoldOut();
        if (message.priceCents != batch.priceCents) revert PriceMismatch();

        tickets[ticketKey] = Ticket({
            status: TicketStatus.Valid,
            batch: batchKey(message.eventId, message.batchId),
            owner: message.owner,
            paymentRef: message.paymentRef,
            listingPriceCents: 0
        });
        payments[message.paymentRef] = PaymentOutcome.Ticket;
        batch.sold += 1;
        emit TicketIssued(
            message.actor,
            message.ticketId,
            message.eventId,
            message.batchId,
            message.owner,
            message.priceCents,
            message.orderRef,
            message.paymentRef
        );
    }

    // ---------------------------------------------------------------------------------------
    // Payment outcomes (payment oracle only)
    // ---------------------------------------------------------------------------------------
    // Every confirmed Pix payment ends here as exactly one ticket, one resale or one refund,
    // and a later bank reversal is recorded against the ticket it paid for.

    function refundPayment(PaymentRefundedMessage calldata message, bytes calldata signature) external {
        _verify(_hashPaymentRefunded(message), message.actor, message.nonce, message.deadline, message.association, signature);
        if (message.actor != oracle) revert OnlyOracleReports();
        if (message.amountCents == 0 || message.amountCents > MAX_SAFE_INTEGER) revert InvalidAmount();
        _requireNewPayment(message.paymentRef);

        payments[message.paymentRef] = PaymentOutcome.Refunded;
        emit PaymentRefunded(message.actor, message.paymentRef, message.amountCents, message.orderRef, message.reason);
    }

    function reversePayment(PaymentReversedMessage calldata message, bytes calldata signature) external {
        _verify(_hashPaymentReversed(message), message.actor, message.nonce, message.deadline, message.association, signature);
        if (message.actor != oracle) revert OnlyOracleReports();
        Ticket storage ticket = tickets[keccak256(bytes(message.ticketId))];
        if (ticket.status == TicketStatus.None) revert UnknownTicket();
        if (ticket.paymentRef != message.paymentRef) revert PaymentDoesNotMatchTicket();
        if (payments[message.paymentRef] == PaymentOutcome.Reversed) revert PaymentAlreadyReversed();
        if (ticket.status == TicketStatus.Revoked) revert TicketNotValid();
        if (message.amountCents == 0 || message.amountCents > MAX_SAFE_INTEGER) revert InvalidAmount();

        payments[message.paymentRef] = PaymentOutcome.Reversed;
        // A resold ticket stays with its buyer, who paid in good faith: the reversal is only an
        // income loss. Otherwise the ticket is revoked and its place goes back on sale.
        if (ticket.status != TicketStatus.Resold) {
            ticket.status = TicketStatus.Revoked;
            ticket.listingPriceCents = 0;
            batches[ticket.batch].sold -= 1;
        }
        emit PaymentReversed(message.actor, message.paymentRef, message.ticketId, message.amountCents);
    }

    // ---------------------------------------------------------------------------------------
    // Resale
    // ---------------------------------------------------------------------------------------

    function listTicket(TicketListedMessage calldata message, bytes calldata signature) external {
        _verify(_hashTicketListed(message), message.actor, message.nonce, message.deadline, message.association, signature);
        Ticket storage ticket = tickets[keccak256(bytes(message.ticketId))];
        if (ticket.status == TicketStatus.None) revert UnknownTicket();
        if (ticket.owner != message.actor) revert OnlyOwnerLists();
        if (ticket.status != TicketStatus.Valid) revert TicketNotValidForResale();
        if (message.priceCents == 0 || message.priceCents > MAX_SAFE_INTEGER) revert InvalidPrice();
        Batch storage batch = batches[ticket.batch];
        uint256 cap = (batch.priceCents * batch.resaleCapPercent) / 100;
        if (message.priceCents > cap) revert AboveResaleCap(cap);

        ticket.status = TicketStatus.Listed;
        ticket.listingPriceCents = message.priceCents;
        emit TicketListed(message.actor, message.ticketId, message.priceCents);
    }

    function cancelListing(ListingCancelledMessage calldata message, bytes calldata signature) external {
        _verify(_hashListingCancelled(message), message.actor, message.nonce, message.deadline, message.association, signature);
        Ticket storage ticket = tickets[keccak256(bytes(message.ticketId))];
        if (ticket.status == TicketStatus.None) revert UnknownTicket();
        if (ticket.owner != message.actor) revert OnlyOwnerCancels();
        if (ticket.status != TicketStatus.Listed) revert TicketNotListed();

        ticket.status = TicketStatus.Valid;
        ticket.listingPriceCents = 0;
        emit ListingCancelled(message.actor, message.ticketId);
    }

    // A paid resale: the listed ticket is cancelled and a new one issued to the buyer, at the
    // listed price, with the fixed split between the association, the platform and the seller.
    function settleResale(ResaleSettledMessage calldata message, bytes calldata signature) external {
        _verify(_hashResaleSettled(message), message.actor, message.nonce, message.deadline, message.association, signature);
        if (message.actor != oracle) revert OnlyOracleReports();
        Ticket storage listed = tickets[keccak256(bytes(message.listedTicketId))];
        if (listed.status != TicketStatus.Listed) revert TicketNotListed();
        if (listed.owner == message.owner) revert OwnListing();
        bytes32 newKey = keccak256(bytes(message.ticketId));
        if (tickets[newKey].status != TicketStatus.None) revert TicketAlreadyIssued();
        if (message.priceCents != listed.listingPriceCents) revert ListedPriceMismatch();
        _checkResaleSplit(message);
        _requireNewPayment(message.paymentRef);

        listed.status = TicketStatus.Resold;
        listed.listingPriceCents = 0;
        tickets[newKey] = Ticket({
            status: TicketStatus.Valid,
            batch: listed.batch,
            owner: message.owner,
            paymentRef: message.paymentRef,
            listingPriceCents: 0
        });
        payments[message.paymentRef] = PaymentOutcome.Ticket;
        _emitResaleSettled(message);
    }

    // ---------------------------------------------------------------------------------------
    // Replacing the payment oracle (board majority, like a handover)
    // ---------------------------------------------------------------------------------------

    function proposeOracleChange(OracleChangeProposedMessage calldata message, bytes calldata signature) external {
        _verify(_hashOracleChangeProposed(message), message.actor, message.nonce, message.deadline, message.association, signature);
        _requireBoardMember(message.actor);
        if (oracleChange.open) revert OracleChangeAlreadyOpen();
        if (message.newOracle == oracle) revert AlreadyOracle();

        oracleChangeRound += 1;
        oracleChange.id = message.proposalId;
        oracleChange.proposer = message.actor;
        oracleChange.newOracle = message.newOracle;
        oracleChange.approvalCount = 0;
        oracleChange.open = true;
        emit OracleChangeProposed(message.actor, message.proposalId, message.newOracle);
        _approveOracleChange(message.actor);
    }

    function approveOracleChange(OracleChangeMessage calldata message, bytes calldata signature) external {
        _verify(_hashOracleChange(ORACLE_CHANGE_APPROVED_TYPEHASH, message), message.actor, message.nonce, message.deadline, message.association, signature);
        _requireBoardMember(message.actor);
        _requireOpenOracleChange(message.proposalId);
        if (approvedOracleChange[oracleChangeRound][message.actor]) revert AlreadyApproved();

        emit OracleChangeApproved(message.actor, message.proposalId);
        _approveOracleChange(message.actor);
    }

    function cancelOracleChange(OracleChangeMessage calldata message, bytes calldata signature) external {
        _verify(_hashOracleChange(ORACLE_CHANGE_CANCELLED_TYPEHASH, message), message.actor, message.nonce, message.deadline, message.association, signature);
        _requireOpenOracleChange(message.proposalId);
        if (message.actor != oracleChange.proposer) revert OnlyProposerCanCancel();

        delete oracleChange;
        emit OracleChangeCancelled(message.actor, message.proposalId);
    }

    // ---------------------------------------------------------------------------------------
    // Expenses
    // ---------------------------------------------------------------------------------------
    // Only amounts, categories and the receipt hash go on-chain. Descriptions and receipt
    // files stay in the backend.

    function proposeExpense(ExpenseProposedMessage calldata message, bytes calldata signature) external {
        _verify(_hashExpenseProposed(message), message.actor, message.nonce, message.deadline, message.association, signature);
        _requireBoardMember(message.actor);
        bytes32 key = keccak256(bytes(message.expenseId));
        if (expenses[key].exists) revert ExpenseAlreadyExists();
        if (message.amountCents == 0 || message.amountCents > MAX_SAFE_INTEGER) revert InvalidAmount();
        if (!_isKnownCategory(message.category)) revert UnknownCategory();

        Expense storage expense = expenses[key];
        expense.exists = true;
        expense.id = message.expenseId;
        expense.proposer = message.actor;
        expense.amountCents = message.amountCents;
        pendingExpenses.push(key);
        emit ExpenseProposed(
            message.actor,
            message.expenseId,
            message.amountCents,
            message.category,
            message.eventId,
            message.receiptSha256
        );

        // Proposing counts as the proposer's approval.
        _recordVote(key, message.actor, true);
    }

    function voteExpense(ExpenseVotedMessage calldata message, bytes calldata signature) external {
        _verify(_hashExpenseVoted(message), message.actor, message.nonce, message.deadline, message.association, signature);
        _requireBoardMember(message.actor);
        bytes32 key = keccak256(bytes(message.expenseId));
        Expense storage expense = expenses[key];
        if (!expense.exists) revert UnknownExpense();
        if (expense.status != ExpenseStatus.Pending) revert ExpenseNotPending();
        if (hasVoted[key][message.actor]) revert AlreadyVoted();

        emit ExpenseVoted(message.actor, message.expenseId, message.approve);
        _recordVote(key, message.actor, message.approve);
    }

    // ---------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------

    function currentBoard() external view returns (address[] memory) {
        return boards[term];
    }

    function isBoardMember(address account) public view returns (bool) {
        return isMemberInTerm[term][account];
    }

    function openHandover()
        external
        view
        returns (bool open, string memory id, address proposer, address[] memory members, uint256 approvalCount)
    {
        return (handover.open, handover.id, handover.proposer, handover.members, handover.approvalCount);
    }

    function getBatch(
        string calldata eventId,
        string calldata batchId
    ) external view returns (bool exists, uint256 priceCents, uint256 quantity, uint256 sold) {
        Batch storage batch = batches[batchKey(eventId, batchId)];
        return (batch.exists, batch.priceCents, batch.quantity, batch.sold);
    }

    function isTicketIssued(string calldata ticketId) external view returns (bool) {
        return tickets[keccak256(bytes(ticketId))].status != TicketStatus.None;
    }

    function getTicket(string calldata ticketId)
        external
        view
        returns (TicketStatus status, address owner, bytes32 paymentRef, uint256 listingPriceCents)
    {
        Ticket storage ticket = tickets[keccak256(bytes(ticketId))];
        return (ticket.status, ticket.owner, ticket.paymentRef, ticket.listingPriceCents);
    }

    function openOracleChange()
        external
        view
        returns (bool open, string memory id, address proposer, address newOracle, uint256 approvalCount)
    {
        return (oracleChange.open, oracleChange.id, oracleChange.proposer, oracleChange.newOracle, oracleChange.approvalCount);
    }

    function getExpense(string calldata expenseId)
        external
        view
        returns (
            bool exists,
            address proposer,
            uint256 amountCents,
            ExpenseStatus status,
            address[] memory approvals,
            address[] memory rejections
        )
    {
        Expense storage expense = expenses[keccak256(bytes(expenseId))];
        return (
            expense.exists,
            expense.proposer,
            expense.amountCents,
            expense.status,
            expense.approvals,
            expense.rejections
        );
    }

    function majorityOf(uint256 count) public pure returns (uint256) {
        return count / 2 + 1;
    }

    // abi.encode keeps the two ids apart, so ("a/b", "c") and ("a", "b/c") never collide.
    function batchKey(string calldata eventId, string calldata batchId) public pure returns (bytes32) {
        return keccak256(abi.encode(eventId, batchId));
    }

    // ---------------------------------------------------------------------------------------
    // Internals: checks
    // ---------------------------------------------------------------------------------------

    // The four checks every signed action goes through, in the same order as the backend's
    // fake ledger. On success the actor's nonce moves on and genesis is closed.
    function _verify(
        bytes32 structHash,
        address actor,
        uint256 nonce,
        uint256 deadline,
        string calldata association_,
        bytes calldata signature
    ) private {
        if (ECDSA.recover(_hashTypedDataV4(structHash), signature) != actor) revert BadSignature();
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (nonce != nonces[actor]) revert BadNonce(nonces[actor]);
        if (keccak256(bytes(association_)) != associationHash) revert WrongAssociation();

        nonces[actor] += 1;
        genesisClosed = true;
    }

    function _requireGenesis() private view {
        if (msg.sender != genesisAuthority) revert NotGenesisAuthority();
        if (genesisClosed) revert GenesisClosed();
    }

    function _requireNewPayment(bytes32 paymentRef) private view {
        if (paymentRef == bytes32(0)) revert InvalidPaymentRef();
        if (payments[paymentRef] != PaymentOutcome.None) revert PaymentAlreadyReported();
    }

    function _requireOpenOracleChange(string calldata proposalId) private view {
        if (!oracleChange.open || keccak256(bytes(proposalId)) != keccak256(bytes(oracleChange.id))) {
            revert NoOpenOracleChangeWithThisId();
        }
    }

    // Rounds half up, like Math.round in resaleSplit (shared/src/records.ts).
    function _checkResaleSplit(ResaleSettledMessage calldata m) private pure {
        uint256 royalty = (m.priceCents * RESALE_ROYALTY_PERCENT + 50) / 100;
        uint256 fee = (m.priceCents * RESALE_PLATFORM_FEE_PERCENT + 50) / 100;
        if (m.royaltyCents != royalty || m.platformFeeCents != fee || m.payoutCents != m.priceCents - royalty - fee) {
            revert ResaleSplitMismatch();
        }
    }

    function _emitResaleSettled(ResaleSettledMessage calldata m) private {
        emit ResaleSettled(
            m.actor,
            m.paymentRef,
            m.listedTicketId,
            m.ticketId,
            m.owner,
            m.priceCents,
            m.royaltyCents,
            m.platformFeeCents,
            m.payoutCents,
            m.orderRef
        );
    }

    function _approveOracleChange(address director) private {
        approvedOracleChange[oracleChangeRound][director] = true;
        oracleChange.approvalCount += 1;
        if (oracleChange.approvalCount >= majorityOf(boards[term].length)) {
            oracle = oracleChange.newOracle;
            delete oracleChange;
            emit OracleChanged(oracle);
        }
    }

    function _requireBoardMember(address actor) private view {
        if (!isBoardMember(actor)) revert NotBoardMember(actor);
    }

    function _requireOpenHandover(string calldata handoverId) private view {
        if (!handover.open || keccak256(bytes(handoverId)) != keccak256(bytes(handover.id))) {
            revert NoOpenHandoverWithThisId();
        }
    }

    function _checkNewBoard(address[] calldata members) private pure {
        if (members.length == 0) revert EmptyBoard();
        for (uint256 i = 0; i < members.length; i++) {
            for (uint256 j = i + 1; j < members.length; j++) {
                if (members[i] == members[j]) revert DuplicateDirector(members[i]);
            }
        }
    }

    function _checkBatchFields(uint256 priceCents, uint256 quantity, uint256 resaleCapPercent) private pure {
        if (priceCents == 0 || priceCents > MAX_SAFE_INTEGER) revert InvalidPrice();
        if (quantity == 0 || quantity > MAX_SAFE_INTEGER) revert InvalidQuantity();
        if (resaleCapPercent < 100 || resaleCapPercent > MAX_SAFE_INTEGER) revert InvalidResaleCap();
    }

    // Same list as EXPENSE_CATEGORIES in shared/src/records.ts.
    function _isKnownCategory(string calldata category) private pure returns (bool) {
        bytes32 hash = keccak256(bytes(category));
        return
            hash == keccak256("Venue") ||
            hash == keccak256("Suppliers") ||
            hash == keccak256("Drinks") ||
            hash == keccak256("Security") ||
            hash == keccak256("Marketing") ||
            hash == keccak256("Seller commissions") ||
            hash == keccak256("Other");
    }

    function _existingBatch(string calldata eventId, string calldata batchId) private view returns (Batch storage) {
        Batch storage batch = batches[batchKey(eventId, batchId)];
        if (!batch.exists) revert UnknownBatch();
        return batch;
    }

    // ---------------------------------------------------------------------------------------
    // Internals: state changes
    // ---------------------------------------------------------------------------------------

    function _approveHandover(address director) private {
        approvedInRound[handoverRound][director] = true;
        handover.approvalCount += 1;

        if (handover.approvalCount >= majorityOf(boards[term].length)) {
            address[] memory newBoard = handover.members;
            delete handover;
            _startTerm(newBoard);
            _recountPendingExpenses();
        }
    }

    function _recordVote(bytes32 key, address director, bool approve) private {
        Expense storage expense = expenses[key];
        hasVoted[key][director] = true;
        if (approve) expense.approvals.push(director);
        else expense.rejections.push(director);
        _updateExpenseStatus(expense);
    }

    // A decided expense stays decided. A pending one is counted again with the current board.
    function _updateExpenseStatus(Expense storage expense) private {
        if (expense.status != ExpenseStatus.Pending) return;
        uint256 majority = majorityOf(boards[term].length);

        if (_countCurrentDirectors(expense.approvals) >= majority) {
            expense.status = ExpenseStatus.Approved;
        } else if (_countCurrentDirectors(expense.rejections) >= majority) {
            expense.status = ExpenseStatus.Rejected;
        } else {
            return;
        }
        emit ExpenseDecided(expense.id, expense.status);
    }

    function _countCurrentDirectors(address[] storage voters) private view returns (uint256 count) {
        for (uint256 i = 0; i < voters.length; i++) {
            if (isMemberInTerm[term][voters[i]]) count += 1;
        }
    }

    // Runs once a new board takes office. Gas grows with the number of pending expenses,
    // which stays small for one association.
    function _recountPendingExpenses() private {
        uint256 i = 0;
        while (i < pendingExpenses.length) {
            Expense storage expense = expenses[pendingExpenses[i]];
            _updateExpenseStatus(expense);
            if (expense.status == ExpenseStatus.Pending) {
                i += 1;
            } else {
                // Swap with the last item and shrink the list. Order does not matter here.
                pendingExpenses[i] = pendingExpenses[pendingExpenses.length - 1];
                pendingExpenses.pop();
            }
        }
    }

    function _startTerm(address[] memory members) private {
        term += 1;
        boards[term] = members;
        for (uint256 i = 0; i < members.length; i++) {
            isMemberInTerm[term][members[i]] = true;
        }
        emit TermStarted(term, members);
    }

    function _createBatch(
        address actor,
        string calldata eventId,
        string calldata batchId,
        uint256 priceCents,
        uint256 quantity,
        uint256 resaleCapPercent
    ) private {
        bytes32 key = batchKey(eventId, batchId);
        if (batches[key].exists) revert BatchAlreadyExists();
        _checkBatchFields(priceCents, quantity, resaleCapPercent);

        batches[key] = Batch({
            exists: true,
            priceCents: priceCents,
            quantity: quantity,
            sold: 0,
            resaleCapPercent: resaleCapPercent
        });
        emit BatchCreated(actor, eventId, batchId, priceCents, quantity, resaleCapPercent);
    }

    // ---------------------------------------------------------------------------------------
    // Internals: EIP-712 struct hashes (strings and arrays are hashed, as the standard requires)
    // ---------------------------------------------------------------------------------------

    function _hashHandoverProposed(HandoverProposedMessage calldata m) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                HANDOVER_PROPOSED_TYPEHASH,
                m.actor,
                m.nonce,
                m.deadline,
                keccak256(bytes(m.association)),
                keccak256(bytes(m.handoverId)),
                keccak256(abi.encodePacked(m.members))
            )
        );
    }

    function _hashHandoverApproved(HandoverApprovedMessage calldata m) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                HANDOVER_APPROVED_TYPEHASH,
                m.actor,
                m.nonce,
                m.deadline,
                keccak256(bytes(m.association)),
                keccak256(bytes(m.handoverId))
            )
        );
    }

    function _hashHandoverCancelled(HandoverCancelledMessage calldata m) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                HANDOVER_CANCELLED_TYPEHASH,
                m.actor,
                m.nonce,
                m.deadline,
                keccak256(bytes(m.association)),
                keccak256(bytes(m.handoverId))
            )
        );
    }

    function _hashBatch(bytes32 typehash, BatchMessage calldata m) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                typehash,
                m.actor,
                m.nonce,
                m.deadline,
                keccak256(bytes(m.association)),
                keccak256(bytes(m.eventId)),
                keccak256(bytes(m.batchId)),
                m.priceCents,
                m.quantity,
                m.resaleCapPercent
            )
        );
    }

    function _hashBatchRemoved(BatchRemovedMessage calldata m) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                BATCH_REMOVED_TYPEHASH,
                m.actor,
                m.nonce,
                m.deadline,
                keccak256(bytes(m.association)),
                keccak256(bytes(m.eventId)),
                keccak256(bytes(m.batchId))
            )
        );
    }

    function _hashTicketIssued(TicketIssuedMessage calldata m) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                TICKET_ISSUED_TYPEHASH,
                m.actor,
                m.nonce,
                m.deadline,
                keccak256(bytes(m.association)),
                keccak256(bytes(m.ticketId)),
                keccak256(bytes(m.eventId)),
                keccak256(bytes(m.batchId)),
                m.owner,
                m.priceCents,
                keccak256(bytes(m.orderRef)),
                m.paymentRef
            )
        );
    }

    function _hashPaymentRefunded(PaymentRefundedMessage calldata m) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                PAYMENT_REFUNDED_TYPEHASH,
                m.actor,
                m.nonce,
                m.deadline,
                keccak256(bytes(m.association)),
                m.paymentRef,
                m.amountCents,
                keccak256(bytes(m.orderRef)),
                keccak256(bytes(m.reason))
            )
        );
    }

    function _hashPaymentReversed(PaymentReversedMessage calldata m) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                PAYMENT_REVERSED_TYPEHASH,
                m.actor,
                m.nonce,
                m.deadline,
                keccak256(bytes(m.association)),
                m.paymentRef,
                keccak256(bytes(m.ticketId)),
                m.amountCents
            )
        );
    }

    function _hashTicketListed(TicketListedMessage calldata m) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                TICKET_LISTED_TYPEHASH,
                m.actor,
                m.nonce,
                m.deadline,
                keccak256(bytes(m.association)),
                keccak256(bytes(m.ticketId)),
                m.priceCents
            )
        );
    }

    function _hashListingCancelled(ListingCancelledMessage calldata m) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                LISTING_CANCELLED_TYPEHASH,
                m.actor,
                m.nonce,
                m.deadline,
                keccak256(bytes(m.association)),
                keccak256(bytes(m.ticketId))
            )
        );
    }

    // Split in two encodes to stay under Solidity's stack limit.
    function _hashResaleSettled(ResaleSettledMessage calldata m) private pure returns (bytes32) {
        bytes memory head = abi.encode(
            RESALE_SETTLED_TYPEHASH,
            m.actor,
            m.nonce,
            m.deadline,
            keccak256(bytes(m.association)),
            m.paymentRef,
            keccak256(bytes(m.listedTicketId)),
            keccak256(bytes(m.ticketId))
        );
        bytes memory tail = abi.encode(
            m.owner,
            m.priceCents,
            m.royaltyCents,
            m.platformFeeCents,
            m.payoutCents,
            keccak256(bytes(m.orderRef))
        );
        return keccak256(bytes.concat(head, tail));
    }

    function _hashOracleChangeProposed(OracleChangeProposedMessage calldata m) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                ORACLE_CHANGE_PROPOSED_TYPEHASH,
                m.actor,
                m.nonce,
                m.deadline,
                keccak256(bytes(m.association)),
                keccak256(bytes(m.proposalId)),
                m.newOracle
            )
        );
    }

    function _hashOracleChange(bytes32 typehash, OracleChangeMessage calldata m) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                typehash,
                m.actor,
                m.nonce,
                m.deadline,
                keccak256(bytes(m.association)),
                keccak256(bytes(m.proposalId))
            )
        );
    }

    function _hashExpenseProposed(ExpenseProposedMessage calldata m) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                EXPENSE_PROPOSED_TYPEHASH,
                m.actor,
                m.nonce,
                m.deadline,
                keccak256(bytes(m.association)),
                keccak256(bytes(m.expenseId)),
                m.amountCents,
                keccak256(bytes(m.category)),
                keccak256(bytes(m.eventId)),
                m.receiptSha256
            )
        );
    }

    function _hashExpenseVoted(ExpenseVotedMessage calldata m) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                EXPENSE_VOTED_TYPEHASH,
                m.actor,
                m.nonce,
                m.deadline,
                keccak256(bytes(m.association)),
                keccak256(bytes(m.expenseId)),
                m.approve
            )
        );
    }
}
