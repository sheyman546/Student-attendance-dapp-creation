// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ProofStorage - Student Attendance DApp
/// @notice Stores immutable attendance proofs on-chain with instructor gating and per-student queryability
contract ProofStorage {
    struct AttendanceRecord {
        uint256 timestamp;
        string courseId;
        bool exists;
    }

    address public admin;
    mapping(address => bool) public instructors;

    // Hash -> AttendanceRecord
    mapping(bytes32 => AttendanceRecord) public proofs;
    // Student address -> array of proof hashes
    mapping(address => bytes32[]) public studentRecords;

    event AttendanceMarked(
        bytes32 indexed hash,
        address indexed student,
        string courseId,
        uint256 timestamp,
        address indexed marker
    );
    event InstructorSet(address indexed instructor, bool status);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier onlyInstructor() {
        require(instructors[msg.sender] || msg.sender == admin, "Not an instructor");
        _;
    }

    constructor() {
        admin = msg.sender;
        instructors[msg.sender] = true;
    }

    // ---------------------------------------------------------------
    //  Admin
    // ---------------------------------------------------------------

    /// @notice Transfer admin role to a new address
    /// @param _newAdmin Address of the new admin
    function transferAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "Zero address");
        require(_newAdmin != admin, "Already admin");
        address oldAdmin = admin;
        admin = _newAdmin;
        emit AdminTransferred(oldAdmin, _newAdmin);
    }

    /// @notice Admin sets or removes an instructor
    /// @param _instructor Address to grant/revoke instructor role
    /// @param _status true to add, false to remove
    function setInstructor(address _instructor, bool _status) external onlyAdmin {
        require(_instructor != address(0), "Zero address");
        instructors[_instructor] = _status;
        emit InstructorSet(_instructor, _status);
    }

    // ---------------------------------------------------------------
    //  Attendance Recording
    // ---------------------------------------------------------------

    /// @notice Instructor marks attendance for a student in a specific course.
    ///         Proof hash is computed off-chain and stored on-chain for verification.
    /// @param student The student's wallet address
    /// @param courseId The course identifier (e.g. "CS101")
    /// @param hash    The attendance proof hash (keccak256 of student + courseId + timestamp)
    function markAttendance(address student, string calldata courseId, bytes32 hash) external onlyInstructor {
        require(student != address(0), "Zero student address");
        require(bytes(courseId).length > 0, "Empty courseId");
        _storeAttendance(student, courseId, hash, msg.sender);
    }

    /// @notice Legacy self-report attendance flow.  Anyone may call this to
    ///         store a proof under their own address with courseId = "DEFAULT".
    ///         For production use, prefer instructor-gated `markAttendance`.
    /// @param hash The attendance proof hash
    function storeProof(bytes32 hash) external {
        _storeAttendance(msg.sender, "DEFAULT", hash, msg.sender);
    }

    /// @dev Internal shared logic for storing an attendance proof
    function _storeAttendance(address student, string memory courseId, bytes32 hash, address marker) private {
        require(!proofs[hash].exists, "Proof already exists");

        proofs[hash] = AttendanceRecord({
            timestamp: block.timestamp,
            courseId: courseId,
            exists: true
        });

        studentRecords[student].push(hash);
        emit AttendanceMarked(hash, student, courseId, block.timestamp, marker);
    }

    // ---------------------------------------------------------------
    //  Queries
    // ---------------------------------------------------------------

    /// @notice Verify whether a proof hash exists on-chain
    function verifyProof(bytes32 hash) external view returns (bool) {
        return proofs[hash].exists;
    }

    /// @notice Get the full attendance record for a given proof hash
    function getAttendanceRecord(bytes32 hash)
        external
        view
        returns (uint256 timestamp, string memory courseId, bool exists)
    {
        AttendanceRecord storage record = proofs[hash];
        return (record.timestamp, record.courseId, record.exists);
    }

    /// @notice Get all proof hashes for a given student
    function getStudentRecords(address student) external view returns (bytes32[] memory) {
        return studentRecords[student];
    }

    /// @notice Get the number of attendance records for a student
    function getStudentRecordCount(address student) external view returns (uint256) {
        return studentRecords[student].length;
    }
}
