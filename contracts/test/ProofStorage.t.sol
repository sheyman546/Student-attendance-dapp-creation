// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ProofStorage} from "../src/ProofStorage.sol";

contract ProofStorageTest is Test {
    ProofStorage public proofStorage;

    address public admin = address(1);
    address public instructor = address(2);
    address public student = address(3);
    address public stranger = address(4);

    event AttendanceMarked(
        bytes32 indexed hash,
        address indexed student,
        string courseId,
        uint256 timestamp,
        address indexed marker
    );
    event InstructorSet(address indexed instructor, bool status);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    function setUp() public {
        vm.prank(admin);
        proofStorage = new ProofStorage();
    }

    // --- Deployment ---

    function test_DeployerIsAdmin() public view {
        assertEq(proofStorage.admin(), admin);
    }

    function test_DeployerIsInstructor() public view {
        assertTrue(proofStorage.instructors(admin));
    }

    // --- Instructor Management ---

    function test_SetInstructor() public {
        vm.prank(admin);
        vm.expectEmit(true, true, false, false);
        emit InstructorSet(instructor, true);
        proofStorage.setInstructor(instructor, true);
        assertTrue(proofStorage.instructors(instructor));
    }

    function test_RemoveInstructor() public {
        vm.startPrank(admin);
        proofStorage.setInstructor(instructor, true);
        assertTrue(proofStorage.instructors(instructor));

        vm.expectEmit(true, true, false, false);
        emit InstructorSet(instructor, false);
        proofStorage.setInstructor(instructor, false);
        assertFalse(proofStorage.instructors(instructor));
    }

    function test_RevertSetInstructor_NotAdmin() public {
        vm.prank(stranger);
        vm.expectRevert("Only admin");
        proofStorage.setInstructor(instructor, true);
    }

    function test_RevertSetInstructor_ZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert("Zero address");
        proofStorage.setInstructor(address(0), true);
    }

    // --- markAttendance (Instructor Flow) ---

    function test_MarkAttendance_ByInstructor() public {
        vm.prank(admin);
        proofStorage.setInstructor(instructor, true);

        bytes32 hash = keccak256(abi.encodePacked(student, "CS101", block.timestamp));

        vm.prank(instructor);
        vm.expectEmit(true, true, false, true);
        emit AttendanceMarked(hash, student, "CS101", block.timestamp, instructor);
        proofStorage.markAttendance(student, "CS101", hash);

        assertTrue(proofStorage.verifyProof(hash));
        (uint256 ts, string memory courseId, bool exists) = proofStorage.getAttendanceRecord(hash);
        assertTrue(exists);
        assertEq(courseId, "CS101");
        assertGt(ts, 0);

        bytes32[] memory records = proofStorage.getStudentRecords(student);
        assertEq(records.length, 1);
        assertEq(records[0], hash);
    }

    function test_MarkAttendance_ByAdmin() public {
        bytes32 hash = keccak256(abi.encodePacked(student, "MATH201", block.timestamp));

        vm.prank(admin);
        proofStorage.markAttendance(student, "MATH201", hash);

        assertTrue(proofStorage.verifyProof(hash));
        assertEq(proofStorage.getStudentRecordCount(student), 1);
    }

    function test_RevertMarkAttendance_NotInstructor() public {
        bytes32 hash = keccak256(abi.encodePacked(student, "CS101", block.timestamp));

        vm.prank(stranger);
        vm.expectRevert("Not an instructor");
        proofStorage.markAttendance(student, "CS101", hash);
    }

    function test_RevertMarkAttendance_DuplicateHash() public {
        vm.prank(admin);
        proofStorage.setInstructor(instructor, true);

        bytes32 hash = keccak256(abi.encodePacked(student, "CS101", block.timestamp));

        vm.startPrank(instructor);
        proofStorage.markAttendance(student, "CS101", hash);

        vm.expectRevert("Proof already exists");
        proofStorage.markAttendance(student, "CS101", hash);
    }

    function test_RevertMarkAttendance_ZeroStudent() public {
        vm.prank(admin);
        bytes32 hash = keccak256(abi.encodePacked("dummy"));
        vm.expectRevert("Zero student address");
        proofStorage.markAttendance(address(0), "CS101", hash);
    }

    function test_RevertMarkAttendance_EmptyCourseId() public {
        vm.prank(admin);
        bytes32 hash = keccak256(abi.encodePacked(student, block.timestamp));
        vm.expectRevert("Empty courseId");
        proofStorage.markAttendance(student, "", hash);
    }

    // --- storeProof (Legacy Student Self-Report) ---

    function test_StoreProof_ByStudent() public {
        bytes32 hash = keccak256(abi.encodePacked(student, block.timestamp));

        vm.prank(student);
        vm.expectEmit(true, true, false, true);
        emit AttendanceMarked(hash, student, "DEFAULT", block.timestamp, student);
        proofStorage.storeProof(hash);

        assertTrue(proofStorage.verifyProof(hash));
        (uint256 timestamp, string memory courseId, bool exists) = proofStorage.getAttendanceRecord(hash);
        assertTrue(exists);
        assertGt(timestamp, 0);
        assertEq(courseId, "DEFAULT");

        bytes32[] memory records = proofStorage.getStudentRecords(student);
        assertEq(records.length, 1);
    }

    function test_StoreProof_ByAnyone() public {
        // Anyone can call storeProof (backward compat), records go to msg.sender
        bytes32 hash = keccak256(abi.encodePacked(stranger, block.timestamp));

        vm.prank(stranger);
        proofStorage.storeProof(hash);

        assertTrue(proofStorage.verifyProof(hash));
        assertEq(proofStorage.getStudentRecordCount(stranger), 1);
    }

    function test_RevertStoreProof_DuplicateHash() public {
        bytes32 hash = keccak256(abi.encodePacked(student, block.timestamp));

        vm.startPrank(student);
        proofStorage.storeProof(hash);

        vm.expectRevert("Proof already exists");
        proofStorage.storeProof(hash);
    }

    // --- verifyProof ---

    function test_VerifyProof_NonExistent() public view {
        bytes32 hash = keccak256(abi.encodePacked("nonexistent"));
        assertFalse(proofStorage.verifyProof(hash));
    }

    // --- getStudentRecords ---

    function test_GetStudentRecords_MultipleRecords() public {
        vm.prank(admin);
        proofStorage.setInstructor(instructor, true);

        vm.startPrank(instructor);
        bytes32 hash1 = keccak256(abi.encodePacked(student, "CS101", uint256(1)));
        bytes32 hash2 = keccak256(abi.encodePacked(student, "MATH201", uint256(2)));
        bytes32 hash3 = keccak256(abi.encodePacked(student, "PHYS301", uint256(3)));

        proofStorage.markAttendance(student, "CS101", hash1);
        proofStorage.markAttendance(student, "MATH201", hash2);
        proofStorage.markAttendance(student, "PHYS301", hash3);
        vm.stopPrank();

        bytes32[] memory records = proofStorage.getStudentRecords(student);
        assertEq(records.length, 3);
        assertEq(records[0], hash1);
        assertEq(records[1], hash2);
        assertEq(records[2], hash3);

        assertEq(proofStorage.getStudentRecordCount(student), 3);
    }

    function test_GetStudentRecords_EmptyForNewStudent() public view {
        bytes32[] memory records = proofStorage.getStudentRecords(stranger);
        assertEq(records.length, 0);
        assertEq(proofStorage.getStudentRecordCount(stranger), 0);
    }

    // --- Admin Transfer ---

    function test_TransferAdmin() public {
        address newAdmin = address(5);

        vm.prank(admin);
        vm.expectEmit(true, true, false, false);
        emit AdminTransferred(admin, newAdmin);
        proofStorage.transferAdmin(newAdmin);

        assertEq(proofStorage.admin(), newAdmin);

        // Old admin can no longer perform admin actions
        vm.prank(admin);
        vm.expectRevert("Only admin");
        proofStorage.setInstructor(instructor, true);

        // New admin can perform admin actions
        vm.prank(newAdmin);
        proofStorage.setInstructor(instructor, true);
        assertTrue(proofStorage.instructors(instructor));
    }

    function test_TransferAdmin_OldAdminStillInstructor() public {
        address newAdmin = address(5);

        vm.prank(admin);
        proofStorage.transferAdmin(newAdmin);

        // Original admin was an instructor at deploy time and should still be
        assertTrue(proofStorage.instructors(admin));
    }

    function test_RevertTransferAdmin_NotAdmin() public {
        vm.prank(stranger);
        vm.expectRevert("Only admin");
        proofStorage.transferAdmin(address(5));
    }

    function test_RevertTransferAdmin_ZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert("Zero address");
        proofStorage.transferAdmin(address(0));
    }

    function test_RevertTransferAdmin_AlreadyAdmin() public {
        vm.prank(admin);
        vm.expectRevert("Already admin");
        proofStorage.transferAdmin(admin);
    }

    // --- Fuzz Tests ---

    function testFuzz_SetInstructor(address _instructor, bool _status) public {
        vm.assume(_instructor != address(0));
        vm.assume(_instructor != admin);

        vm.prank(admin);
        proofStorage.setInstructor(_instructor, _status);
        assertEq(proofStorage.instructors(_instructor), _status);
    }

    function testFuzz_MarkAttendance(string calldata courseId) public {
        vm.assume(bytes(courseId).length > 0);
        vm.assume(bytes(courseId).length <= 64);

        vm.prank(admin);
        bytes32 hash = keccak256(abi.encodePacked(student, courseId, block.timestamp));
        proofStorage.markAttendance(student, courseId, hash);

        assertTrue(proofStorage.verifyProof(hash));
        (, string memory storedCourseId,) = proofStorage.getAttendanceRecord(hash);
        assertEq(storedCourseId, courseId);
    }

    function testFuzz_StoreProof(address caller) public {
        vm.assume(caller != address(0));

        bytes32 hash = keccak256(abi.encodePacked(caller, block.timestamp));

        vm.prank(caller);
        proofStorage.storeProof(hash);

        assertTrue(proofStorage.verifyProof(hash));
        assertEq(proofStorage.getStudentRecordCount(caller), 1);
    }

    function testFuzz_TransferAdmin(address newAdmin) public {
        vm.assume(newAdmin != address(0));
        vm.assume(newAdmin != admin);

        vm.prank(admin);
        proofStorage.transferAdmin(newAdmin);

        assertEq(proofStorage.admin(), newAdmin);

        // Old admin loses privileges
        vm.prank(admin);
        vm.expectRevert("Only admin");
        proofStorage.setInstructor(instructor, true);

        // New admin has full privileges
        vm.startPrank(newAdmin);
        proofStorage.setInstructor(instructor, true);
        assertTrue(proofStorage.instructors(instructor));
        // New admin can also mark attendance
        bytes32 hash = keccak256(abi.encodePacked(student, "FUZZ", block.timestamp));
        proofStorage.markAttendance(student, "FUZZ", hash);
        assertTrue(proofStorage.verifyProof(hash));
    }
}
