//SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

/// @title ProofStorage — Attendance Ledger
/// @notice On-chain ledger for student attendance with contract-enforced
///         safeguards.
///
/// The contract is the source of truth for:
///   - the registered student roster (only the admin/teacher can register)
///   - courses (created by the admin/teacher)
///   - attendance sessions (opened by the admin/teacher with a start time and
///     a duration; they become unclaimable automatically once the duration
///     has elapsed, even if nobody closes them)
///   - attendance marks (only registered students, only during the open
///     window, never twice per session)
///
/// Every state change emits an event so dashboards can react in real time
/// instead of polling.
///
/// It also retains the legacy proof-hash store (storeProof/verifyProof) so
/// existing integrations keep working. `markers` are teachers — addresses the
/// owner grants the teacher role to. The owner and any teacher may register
/// students, create courses and open/close sessions.
contract ProofStorage {
    address public owner;

    /// @dev Teachers (markers). The owner is implicitly a teacher too.
    mapping(address => bool) public markers;

    /// @dev Students who may mark attendance (registered by admin/teacher).
    mapping(address => bool) public registeredStudents;

    /// @dev Legacy proof hashes recorded by the owner or teachers.
    mapping(bytes32 => bool) public proofs;

    uint256 public courseCount;

    struct Course {
        string code;
        string name;
        bool exists;
    }

    /// @dev courseId => Course (1-indexed by courseCount).
    mapping(uint256 => Course) public courses;

    uint256 public sessionCount;

    /// @dev Hard cap on how long a session window may last (90 days).
    uint256 public constant MAX_SESSION_DURATION = 90 * 24 * 3600;

    struct Session {
        uint256 courseId;
        uint256 startTime; // unix seconds
        uint256 duration; // seconds
        bool closed;
        bool exists;
        uint256 createdAt;
    }

    /// @dev sessionId => Session (1-indexed by sessionCount).
    mapping(uint256 => Session) public sessions;

    /// @dev sessionId => student => whether that student already marked.
    mapping(uint256 => mapping(address => bool)) public hasMarked;

    // ---- Legacy proof events ----
    event ProofStored(
        bytes32 indexed hash,
        address indexed student,
        uint256 timestamp
    );
    event MarkerAuthorized(address indexed marker);
    event MarkerRevoked(address indexed marker);
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    // ---- Attendance ledger events ----
    event StudentRegistered(address indexed student);
    event StudentUnregistered(address indexed student);
    event CourseCreated(
        uint256 indexed courseId,
        string code,
        string name
    );
    event SessionOpened(
        uint256 indexed sessionId,
        uint256 indexed courseId,
        uint256 startTime,
        uint256 duration
    );
    event SessionClosed(uint256 indexed sessionId, uint256 courseId);
    event AttendanceMarked(
        uint256 indexed sessionId,
        address indexed student,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    /// @dev Owner or an authorized teacher (marker).
    modifier onlyAdminOrTeacher() {
        require(
            msg.sender == owner || markers[msg.sender],
            "not authorized"
        );
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ------------------------------------------------------------------
    // Legacy proof hash storage
    // ------------------------------------------------------------------

    /// @notice Records an attendance proof hash for a student.
    /// @dev Only the owner or an authorized teacher may call this.
    function storeProof(bytes32 hash, address student) external onlyAdminOrTeacher {
        require(student != address(0), "invalid student");
        proofs[hash] = true;
        emit ProofStored(hash, student, block.timestamp);
    }

    /// @notice Returns whether a proof hash has been recorded on-chain.
    function verifyProof(bytes32 hash) external view returns (bool) {
        return proofs[hash];
    }

    /// @notice Grants an address the teacher (marker) role.
    function authorizeMarker(address marker) external onlyOwner {
        require(marker != address(0), "invalid marker");
        markers[marker] = true;
        emit MarkerAuthorized(marker);
    }

    /// @notice Revokes an address's teacher (marker) role.
    function revokeMarker(address marker) external onlyOwner {
        require(markers[marker], "marker not set");
        markers[marker] = false;
        emit MarkerRevoked(marker);
    }

    /// @notice Transfers contract ownership to a new address.
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "invalid owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ------------------------------------------------------------------
    // Student registry
    // ------------------------------------------------------------------

    /// @notice Registers a student so they can mark attendance.
    /// @dev Admin/teacher only.
    function registerStudent(address student) external onlyAdminOrTeacher {
        require(student != address(0), "invalid student");
        require(!registeredStudents[student], "already registered");
        registeredStudents[student] = true;
        emit StudentRegistered(student);
    }

    /// @notice Removes a student from the roster.
    /// @dev Admin/teacher only.
    function unregisterStudent(address student) external onlyAdminOrTeacher {
        require(registeredStudents[student], "not registered");
        registeredStudents[student] = false;
        emit StudentUnregistered(student);
    }

    /// @notice Returns whether `student` may mark attendance.
    function isStudentRegistered(address student) external view returns (bool) {
        return registeredStudents[student];
    }

    // ------------------------------------------------------------------
    // Courses
    // ------------------------------------------------------------------

    /// @notice Creates a course (code + name). Returns its id.
    /// @dev Admin/teacher only.
    function createCourse(
        string calldata code,
        string calldata name
    ) external onlyAdminOrTeacher returns (uint256 courseId) {
        require(bytes(code).length > 0 && bytes(code).length <= 16, "invalid course code");
        require(bytes(name).length > 0 && bytes(name).length <= 64, "invalid course name");
        courseId = ++courseCount;
        courses[courseId] = Course({code: code, name: name, exists: true});
        emit CourseCreated(courseId, code, name);
    }

    /// @notice Returns a course's code and name.
    function getCourse(
        uint256 courseId
    ) external view returns (string memory code, string memory name) {
        Course storage c = courses[courseId];
        require(c.exists, "course not found");
        return (c.code, c.name);
    }

    // ------------------------------------------------------------------
    // Sessions
    // ------------------------------------------------------------------

    /// @notice Opens an attendance session for a course.
    /// @param courseId  Course this session belongs to.
    /// @param startTime Unix seconds when marking becomes allowed.
    /// @param duration  How long marking stays allowed (seconds).
    /// @dev Admin/teacher only. Marking is only possible while
    ///      startTime <= block.timestamp <= startTime + duration.
    function openSession(
        uint256 courseId,
        uint256 startTime,
        uint256 duration
    ) external onlyAdminOrTeacher returns (uint256 sessionId) {
        require(courses[courseId].exists, "course not found");
        require(duration > 0, "duration must be > 0");
        require(duration <= MAX_SESSION_DURATION, "duration too long");
        sessionId = ++sessionCount;
        sessions[sessionId] = Session({
            courseId: courseId,
            startTime: startTime,
            duration: duration,
            closed: false,
            exists: true,
            createdAt: block.timestamp
        });
        emit SessionOpened(sessionId, courseId, startTime, duration);
    }

    /// @notice Manually closes a session before its duration expires.
    /// @dev Admin/teacher only. No-op protection against double close.
    function closeSession(uint256 sessionId) external onlyAdminOrTeacher {
        Session storage s = sessions[sessionId];
        require(s.exists, "session not found");
        require(!s.closed, "already closed");
        s.closed = true;
        emit SessionClosed(sessionId, s.courseId);
    }

    /// @notice Returns the details of a session.
    function getSession(
        uint256 sessionId
    )
        external
        view
        returns (
            uint256 courseId,
            uint256 startTime,
            uint256 duration,
            bool closed,
            bool exists
        )
    {
        Session storage s = sessions[sessionId];
        return (
            s.courseId,
            s.startTime,
            s.duration,
            s.closed,
            s.exists
        );
    }

    /// @notice True while marking is currently allowed for this session:
    ///         exists, not closed, and within the start+duration window.
    /// @dev Auto-expiry: once block.timestamp exceeds startTime + duration
    ///      this returns false even if nobody closed the session.
    function isSessionActive(uint256 sessionId) public view returns (bool) {
        Session storage s = sessions[sessionId];
        if (!s.exists || s.closed) return false;
        if (block.timestamp < s.startTime) return false;
        if (block.timestamp > s.startTime + s.duration) return false;
        return true;
    }

    // ------------------------------------------------------------------
    // Attendance
    // ------------------------------------------------------------------

    /// @notice Marks the sender as present for a session.
    /// @dev Enforces every safeguard on-chain:
    ///      - the sender must be a registered student
    ///      - the session must exist and not be closed
    ///      - the current time must be within start..start+duration
    ///        (a session past its duration is unclaimable automatically)
    ///      - the student must not have already marked this session
    function markAttendance(uint256 sessionId) external {
        require(registeredStudents[msg.sender], "student not registered");
        Session storage s = sessions[sessionId];
        require(s.exists, "session not found");
        require(!s.closed, "session closed");
        require(block.timestamp >= s.startTime, "session not started");
        require(
            block.timestamp <= s.startTime + s.duration,
            "session expired"
        );
        require(!hasMarked[sessionId][msg.sender], "already marked");
        hasMarked[sessionId][msg.sender] = true;
        emit AttendanceMarked(sessionId, msg.sender, block.timestamp);
    }

    /// @notice Returns whether `student` already marked `sessionId`.
    function hasStudentMarked(
        uint256 sessionId,
        address student
    ) external view returns (bool) {
        return hasMarked[sessionId][student];
    }
}
