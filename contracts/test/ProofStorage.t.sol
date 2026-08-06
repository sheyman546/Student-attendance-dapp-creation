// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {Test} from "forge-std/Test.sol";
import {ProofStorage} from "../src/ProofStorage.sol";

contract ProofStorageTest is Test {
    ProofStorage public proofStorage;

    address internal owner = address(0xA11CE);
    address internal teacher = address(0xB0B);
    address internal student = address(0xCAFE);
    address internal other = address(0xDEAD);
    bytes32 internal constant HASH = keccak256("attendance-record");

    uint256 internal courseId;
    uint256 internal sessionId;

    function setUp() public {
        vm.prank(owner);
        proofStorage = new ProofStorage();

        vm.prank(owner);
        proofStorage.registerStudent(student);

        vm.prank(owner);
        courseId = proofStorage.createCourse("CS101", "Blockchain Basics");
    }

    // ------------------------------------------------------------------
    // Legacy proof storage (unchanged behaviour)
    // ------------------------------------------------------------------

    function test_OwnerCanStoreAndVerifyProof() public {
        vm.prank(owner);
        proofStorage.storeProof(HASH, student);

        assertTrue(proofStorage.verifyProof(HASH));
    }

    function test_AuthorizedMarkerCanStoreProof() public {
        vm.prank(owner);
        proofStorage.authorizeMarker(teacher);

        vm.prank(teacher);
        proofStorage.storeProof(HASH, student);

        assertTrue(proofStorage.verifyProof(HASH));
    }

    function test_UnauthorizedAccountCannotStoreProof() public {
        vm.prank(student);
        vm.expectRevert(bytes("not authorized"));
        proofStorage.storeProof(HASH, student);
    }

    function test_CannotStoreProofForZeroAddressStudent() public {
        vm.prank(owner);
        vm.expectRevert(bytes("invalid student"));
        proofStorage.storeProof(HASH, address(0));
    }

    function test_RevokedMarkerCannotStoreProof() public {
        vm.prank(owner);
        proofStorage.authorizeMarker(teacher);
        vm.prank(owner);
        proofStorage.revokeMarker(teacher);

        vm.prank(teacher);
        vm.expectRevert(bytes("not authorized"));
        proofStorage.storeProof(HASH, student);
    }

    function test_OnlyOwnerCanAuthorizeMarker() public {
        vm.prank(student);
        vm.expectRevert(bytes("not owner"));
        proofStorage.authorizeMarker(teacher);
    }

    function test_OnlyOwnerCanRevokeMarker() public {
        vm.prank(teacher);
        vm.expectRevert(bytes("not owner"));
        proofStorage.revokeMarker(teacher);
    }

    function test_OnlyOwnerCanTransferOwnership() public {
        vm.prank(student);
        vm.expectRevert(bytes("not owner"));
        proofStorage.transferOwnership(student);
    }

    function test_TransferOwnershipUpdatesOwner() public {
        vm.prank(owner);
        proofStorage.transferOwnership(student);

        assertEq(proofStorage.owner(), student);

        // Old owner can no longer store proofs
        vm.prank(owner);
        vm.expectRevert(bytes("not authorized"));
        proofStorage.storeProof(HASH, student);
    }

    function testFuzz_StoreAndVerifyProof(bytes32 hash) public {
        vm.prank(owner);
        proofStorage.storeProof(hash, student);

        assertTrue(proofStorage.verifyProof(hash));
    }

    // ------------------------------------------------------------------
    // Student registry
    // ------------------------------------------------------------------

    function test_OwnerCanRegisterStudent() public {
        vm.prank(owner);
        proofStorage.registerStudent(other);

        assertTrue(proofStorage.isStudentRegistered(other));
    }

    function test_TeacherCanRegisterStudent() public {
        vm.prank(owner);
        proofStorage.authorizeMarker(teacher);

        vm.prank(teacher);
        proofStorage.registerStudent(other);

        assertTrue(proofStorage.isStudentRegistered(other));
    }

    function test_UnauthorizedCannotRegisterStudent() public {
        vm.prank(other);
        vm.expectRevert(bytes("not authorized"));
        proofStorage.registerStudent(other);
    }

    function test_CannotRegisterSameStudentTwice() public {
        vm.prank(owner);
        vm.expectRevert(bytes("already registered"));
        proofStorage.registerStudent(student);
    }

    function test_CannotRegisterZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(bytes("invalid student"));
        proofStorage.registerStudent(address(0));
    }

    function test_UnregisterStudent() public {
        vm.prank(owner);
        proofStorage.unregisterStudent(student);

        assertFalse(proofStorage.isStudentRegistered(student));
    }

    function test_UnregisterUnknownStudentReverts() public {
        vm.prank(owner);
        vm.expectRevert(bytes("not registered"));
        proofStorage.unregisterStudent(other);
    }

    function test_TeacherCannotUnregisterOutsideRole() public {
        vm.prank(student);
        vm.expectRevert(bytes("not authorized"));
        proofStorage.unregisterStudent(student);
    }

    // ------------------------------------------------------------------
    // Courses
    // ------------------------------------------------------------------

    function test_CreateCourseReturnsSequentialId() public {
        assertEq(courseId, 1);
        vm.prank(owner);
        uint256 id = proofStorage.createCourse("MATH201", "Calculus II");
        assertEq(id, 2);

        (string memory code, string memory name) = proofStorage.getCourse(id);
        assertEq(code, "MATH201");
        assertEq(name, "Calculus II");
    }

    function test_TeacherCanCreateCourse() public {
        vm.prank(owner);
        proofStorage.authorizeMarker(teacher);

        vm.prank(teacher);
        uint256 id = proofStorage.createCourse("PHY101", "Physics");
        assertEq(id, 2);
    }

    function test_UnauthorizedCannotCreateCourse() public {
        vm.prank(student);
        vm.expectRevert(bytes("not authorized"));
        proofStorage.createCourse("HACK", "Hacked");
    }

    function test_RejectsEmptyCourseCode() public {
        vm.prank(owner);
        vm.expectRevert(bytes("invalid course code"));
        proofStorage.createCourse("", "Name");
    }

    function test_RejectsOverlongCourseCode() public {
        vm.prank(owner);
        vm.expectRevert(bytes("invalid course code"));
        proofStorage.createCourse("12345678901234567", "Name");
    }

    function test_RejectsEmptyCourseName() public {
        vm.prank(owner);
        vm.expectRevert(bytes("invalid course name"));
        proofStorage.createCourse("CS101", "");
    }

    function test_GetUnknownCourseReverts() public {
        vm.expectRevert(bytes("course not found"));
        proofStorage.getCourse(99);
    }

    // ------------------------------------------------------------------
    // Sessions
    // ------------------------------------------------------------------

    function openSession(uint256 startTime, uint256 duration) internal returns (uint256 id) {
        vm.prank(owner);
        id = proofStorage.openSession(courseId, startTime, duration);
    }

    function test_OpenSessionReturnsSequentialId() public {
        uint256 now = block.timestamp;
        uint256 id = openSession(now, 3600);
        assertEq(id, 1);
        assertEq(proofStorage.sessionCount(), 1);

        uint256 id2 = openSession(now + 7200, 1800);
        assertEq(id2, 2);
    }

    function test_TeacherCanOpenSession() public {
        vm.prank(owner);
        proofStorage.authorizeMarker(teacher);

        vm.prank(teacher);
        uint256 id = proofStorage.openSession(courseId, block.timestamp, 3600);
        assertEq(id, 1);
    }

    function test_UnauthorizedCannotOpenSession() public {
        vm.prank(student);
        vm.expectRevert(bytes("not authorized"));
        proofStorage.openSession(courseId, block.timestamp, 3600);
    }

    function test_OpenSessionRequiresExistingCourse() public {
        vm.prank(owner);
        vm.expectRevert(bytes("course not found"));
        proofStorage.openSession(99, block.timestamp, 3600);
    }

    function test_OpenSessionRequiresPositiveDuration() public {
        vm.prank(owner);
        vm.expectRevert(bytes("duration must be > 0"));
        proofStorage.openSession(courseId, block.timestamp, 0);
    }

    function test_OpenSessionRejectsOverlongDuration() public {
        // Read the constant first — calling the getter consumes vm.prank.
        uint256 maxDuration = proofStorage.MAX_SESSION_DURATION();
        vm.prank(owner);
        vm.expectRevert(bytes("duration too long"));
        proofStorage.openSession(courseId, block.timestamp, maxDuration + 1);
        assertEq(proofStorage.sessionCount(), 0);
    }

    function test_OpenSessionAcceptsMaxDuration() public {
        uint256 maxDuration = proofStorage.MAX_SESSION_DURATION();
        vm.prank(owner);
        uint256 id = proofStorage.openSession(
            courseId,
            block.timestamp,
            maxDuration
        );
        assertEq(id, 1);
        assertTrue(proofStorage.isSessionActive(id));
    }

    function test_CloseSessionByOwner() public {
        uint256 id = openSession(block.timestamp, 3600);
        vm.prank(owner);
        proofStorage.closeSession(id);

        (,,, bool closed, bool exists) = proofStorage.getSession(id);
        assertTrue(closed);
        assertTrue(exists);
    }

    function test_TeacherCanCloseSession() public {
        vm.prank(owner);
        proofStorage.authorizeMarker(teacher);

        uint256 id = openSession(block.timestamp, 3600);
        vm.prank(teacher);
        proofStorage.closeSession(id);

        (,,, bool closed,) = proofStorage.getSession(id);
        assertTrue(closed);
    }

    function test_UnauthorizedCannotCloseSession() public {
        uint256 id = openSession(block.timestamp, 3600);
        vm.prank(student);
        vm.expectRevert(bytes("not authorized"));
        proofStorage.closeSession(id);
    }

    function test_CannotCloseUnknownSession() public {
        vm.prank(owner);
        vm.expectRevert(bytes("session not found"));
        proofStorage.closeSession(42);
    }

    function test_CannotCloseSessionTwice() public {
        uint256 id = openSession(block.timestamp, 3600);
        vm.prank(owner);
        proofStorage.closeSession(id);
        vm.prank(owner);
        vm.expectRevert(bytes("already closed"));
        proofStorage.closeSession(id);
    }

    // ------------------------------------------------------------------
    // Session liveness (incl. automatic expiry)
    // ------------------------------------------------------------------

    function test_SessionInactiveBeforeStart() public {
        uint256 id = openSession(block.timestamp + 1000, 3600);
        assertFalse(proofStorage.isSessionActive(id));
    }

    function test_SessionActiveWithinWindow() public {
        uint256 id = openSession(block.timestamp, 3600);
        assertTrue(proofStorage.isSessionActive(id));
    }

    function test_SessionAutoExpiresAfterDuration() public {
        uint256 start = block.timestamp;
        uint256 id = openSession(start, 3600);
        vm.warp(start + 3600); // exactly at the deadline -> still active
        assertTrue(proofStorage.isSessionActive(id));

        vm.warp(start + 3601); // one second past -> automatically expired
        assertFalse(proofStorage.isSessionActive(id));
    }

    function test_ClosedSessionInactive() public {
        uint256 id = openSession(block.timestamp, 3600);
        vm.prank(owner);
        proofStorage.closeSession(id);
        assertFalse(proofStorage.isSessionActive(id));
    }

    function test_UnknownSessionInactive() public {
        assertFalse(proofStorage.isSessionActive(99));
    }

    // ------------------------------------------------------------------
    // markAttendance safeguards
    // ------------------------------------------------------------------

    function test_RegisteredStudentCanMarkDuringWindow() public {
        uint256 id = openSession(block.timestamp, 3600);

        vm.prank(student);
        proofStorage.markAttendance(id);

        assertTrue(proofStorage.hasStudentMarked(id, student));
    }

    function test_UnregisteredStudentCannotMark() public {
        uint256 id = openSession(block.timestamp, 3600);

        vm.prank(other);
        vm.expectRevert(bytes("student not registered"));
        proofStorage.markAttendance(id);
    }

    function test_TeacherIsNotAStudent() public {
        vm.prank(owner);
        proofStorage.authorizeMarker(teacher);
        uint256 id = openSession(block.timestamp, 3600);

        // Teacher role does NOT imply student role — marking requires
        // registeredStudents[msg.sender] specifically.
        vm.prank(teacher);
        vm.expectRevert(bytes("student not registered"));
        proofStorage.markAttendance(id);
    }

    function test_CannotMarkBeforeStart() public {
        uint256 id = openSession(block.timestamp + 1000, 3600);

        vm.prank(student);
        vm.expectRevert(bytes("session not started"));
        proofStorage.markAttendance(id);
    }

    function test_CannotMarkAfterAutoExpiry() public {
        uint256 start = block.timestamp;
        uint256 id = openSession(start, 3600);

        vm.warp(start + 3601);
        vm.prank(student);
        vm.expectRevert(bytes("session expired"));
        proofStorage.markAttendance(id);
    }

    function test_CannotMarkClosedSession() public {
        uint256 id = openSession(block.timestamp, 3600);
        vm.prank(owner);
        proofStorage.closeSession(id);

        vm.prank(student);
        vm.expectRevert(bytes("session closed"));
        proofStorage.markAttendance(id);
    }

    function test_CannotDoubleMarkSameSession() public {
        uint256 id = openSession(block.timestamp, 3600);

        vm.prank(student);
        proofStorage.markAttendance(id);

        vm.prank(student);
        vm.expectRevert(bytes("already marked"));
        proofStorage.markAttendance(id);
    }

    function test_CannotMarkUnknownSession() public {
        vm.prank(student);
        vm.expectRevert(bytes("session not found"));
        proofStorage.markAttendance(77);
    }

    function test_CanMarkDifferentSessionsOfSameCourse() public {
        uint256 id1 = openSession(block.timestamp, 3600);
        uint256 id2 = openSession(block.timestamp + 7200, 3600);

        vm.prank(student);
        proofStorage.markAttendance(id1);

        vm.warp(block.timestamp + 7200); // session 2 window opens
        vm.prank(student);
        proofStorage.markAttendance(id2);

        assertTrue(proofStorage.hasStudentMarked(id1, student));
        assertTrue(proofStorage.hasStudentMarked(id2, student));
    }

    function test_AttendanceMarkedEmitsEvent() public {
        uint256 id = openSession(block.timestamp, 3600);
        uint256 ts = block.timestamp;

        vm.prank(student);
        vm.expectEmit(true, true, true, true);
        emit ProofStorage.AttendanceMarked(id, student, ts);
        proofStorage.markAttendance(id);
    }

    function test_SessionOpenedEmitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit ProofStorage.SessionOpened(1, courseId, block.timestamp, 3600);
        proofStorage.openSession(courseId, block.timestamp, 3600);
    }

    function test_CourseCreatedEmitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit ProofStorage.CourseCreated(2, "WEB3", "Web3 Dev");
        proofStorage.createCourse("WEB3", "Web3 Dev");
    }

    function test_StudentRegisteredEmitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit ProofStorage.StudentRegistered(other);
        proofStorage.registerStudent(other);
    }
}
