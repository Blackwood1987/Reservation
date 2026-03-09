import assert from "node:assert/strict";
import {
  buildTimelineMachineIds,
  canRolePerform,
  canUserOperateBooking,
  clampHour,
  formatTime,
  hasBookingOverlap,
  snapToHalfHour,
  validateBookingDrop,
  validateBookingResize
} from "../core-utils.mjs";

const tests = [
  {
    name: "formatTime formats half hours and rounds minutes",
    run() {
      assert.equal(formatTime(9), "09:00");
      assert.equal(formatTime(9.5), "09:30");
      assert.equal(formatTime(17.999), "18:00");
    }
  },
  {
    name: "clampHour and snapToHalfHour keep values inside operating hours",
    run() {
      assert.equal(clampHour(8.2), 9);
      assert.equal(clampHour(18.7), 18);
      assert.equal(snapToHalfHour(9.24), 9);
      assert.equal(snapToHalfHour(9.26), 9.5);
    }
  },
  {
    name: "role permission helper keeps demo access boundaries",
    run() {
      assert.equal(canRolePerform("admin", "admin"), true);
      assert.equal(canRolePerform("supervisor", "print"), true);
      assert.equal(canRolePerform("worker", "create"), true);
      assert.equal(canRolePerform("worker", "admin"), false);
      assert.equal(canRolePerform("guest", "create"), false);
    }
  },
  {
    name: "booking ownership helper allows own worker booking only",
    run() {
      const booking = { user: "홍길동", userId: "worker01", createdBy: "uid-1" };
      assert.equal(canUserOperateBooking({ role: "worker", id: "worker01", uid: "uid-2", name: "홍길동" }, booking), true);
      assert.equal(canUserOperateBooking({ role: "worker", id: "worker02", uid: "uid-2", name: "다른사람" }, booking), false);
      assert.equal(canUserOperateBooking({ role: "supervisor", id: "sup01" }, booking), true);
      assert.equal(canUserOperateBooking({ role: "guest" }, booking), false);
      assert.equal(canUserOperateBooking({ role: "worker", id: "worker01" }, { ...booking, user: "System" }), false);
    }
  },
  {
    name: "hasBookingOverlap respects ignoreDocId",
    run() {
      const bookings = [
        { docId: "a", start: 10, duration: 1 },
        { docId: "b", start: 13, duration: 0.5 }
      ];
      assert.equal(hasBookingOverlap(bookings, 10.5, 0.5), true);
      assert.equal(hasBookingOverlap(bookings, 11, 0.5), false);
      assert.equal(hasBookingOverlap(bookings, 10, 1, "a"), false);
    }
  },
  {
    name: "drop validation blocks early move and overlap",
    run() {
      const booking = { duration: 1 };
      assert.deepEqual(
        validateBookingDrop({ booking, canDrag: true, targetHour: 9.5, minHour: 10, overlap: false }),
        { ok: false, reason: "오늘 예약은 10:00 이후로만 이동할 수 있습니다." }
      );
      assert.deepEqual(
        validateBookingDrop({ booking, canDrag: true, targetHour: 17.5, overlap: false }),
        { ok: false, reason: "운영 시간(09:00~18:00)을 벗어납니다." }
      );
      assert.deepEqual(
        validateBookingDrop({ booking, canDrag: true, targetHour: 11, overlap: true }),
        { ok: false, reason: "다른 예약과 시간이 겹칩니다." }
      );
    }
  },
  {
    name: "resize validation keeps booking inside operating hours",
    run() {
      const booking = { start: 16.5 };
      assert.deepEqual(
        validateBookingResize({ booking, newDuration: 2, overlap: false }),
        { ok: false, reason: "운영 시간 범위를 벗어납니다." }
      );
      assert.deepEqual(
        validateBookingResize({ booking, newDuration: 1, overlap: true }),
        { ok: false, reason: "다른 예약과 시간이 겹칩니다." }
      );
      assert.deepEqual(
        validateBookingResize({ booking, newDuration: 1, overlap: false }),
        { ok: true, reason: "변경 가능합니다." }
      );
    }
  },
  {
    name: "buildTimelineMachineIds pins CRF from cell bank room and sorts remaining machines",
    run() {
      const orderedRooms = [
        { id: "room-cell", name: "314호 세포은행", order: 1 },
        { id: "room-a", name: "M2-301", order: 2 },
        { id: "room-b", name: "M2-401", order: 3 }
      ];
      const machineIdsByRoomId = {
        "room-cell": ["CRF"],
        "room-a": ["BSC-1540", "BSC-1539"],
        "room-b": ["BSC-1542", "BSC-1541"]
      };
      const allMachineIds = ["CRF", "BSC-1540", "BSC-1539", "BSC-1542", "BSC-1541"];
      const machineRoomIdsById = {
        "CRF": "room-cell",
        "BSC-1540": "room-a",
        "BSC-1539": "room-a",
        "BSC-1542": "room-b",
        "BSC-1541": "room-b"
      };

      assert.deepEqual(
        buildTimelineMachineIds({ orderedRooms, machineIdsByRoomId, allMachineIds, machineRoomIdsById }),
        ["CRF", "BSC-1539", "BSC-1540", "BSC-1541", "BSC-1542"]
      );
    }
  }
];

let passed = 0;
for (const test of tests) {
  try {
    test.run();
    passed += 1;
    console.log(`PASS ${test.name}`);
  } catch (error) {
    console.error(`FAIL ${test.name}`);
    console.error(error);
    process.exitCode = 1;
    break;
  }
}

if (!process.exitCode) {
  console.log(`All tests passed (${passed}/${tests.length})`);
}
