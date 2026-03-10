import assert from "node:assert/strict";
import {
  buildMobileReservationCategories,
  buildTimelineMachineIds,
  canRolePerform,
  canUserOperateBooking,
  clampHour,
  deriveMachineCategory,
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
      const booking = { user: "Worker Name", userId: "worker01", createdBy: "uid-1" };
      assert.equal(canUserOperateBooking({ role: "worker", id: "worker01", uid: "uid-2", name: "Worker Name" }, booking), true);
      assert.equal(canUserOperateBooking({ role: "worker", id: "worker02", uid: "uid-2", name: "Other User" }, booking), false);
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
        { ok: false, reason: "\uC624\uB298 \uC608\uC57D\uC740 10:00 \uC774\uD6C4\uB85C\uB9CC \uC774\uB3D9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." }
      );
      assert.deepEqual(
        validateBookingDrop({ booking, canDrag: true, targetHour: 17.5, overlap: false }),
        { ok: false, reason: "\uC6B4\uC601 \uC2DC\uAC04(09:00~18:00)\uC744 \uBC97\uC5B4\uB0A9\uB2C8\uB2E4." }
      );
      assert.deepEqual(
        validateBookingDrop({ booking, canDrag: true, targetHour: 11, overlap: true }),
        { ok: false, reason: "\uB2E4\uB978 \uC608\uC57D\uACFC \uC2DC\uAC04\uC774 \uACB9\uCE69\uB2C8\uB2E4." }
      );
    }
  },
  {
    name: "resize validation keeps booking inside operating hours",
    run() {
      const booking = { start: 16.5 };
      assert.deepEqual(
        validateBookingResize({ booking, newDuration: 2, overlap: false }),
        { ok: false, reason: "\uC6B4\uC601 \uC2DC\uAC04 \uBC94\uC704\uB97C \uBC97\uC5B4\uB0A9\uB2C8\uB2E4." }
      );
      assert.deepEqual(
        validateBookingResize({ booking, newDuration: 1, overlap: true }),
        { ok: false, reason: "\uB2E4\uB978 \uC608\uC57D\uACFC \uC2DC\uAC04\uC774 \uACB9\uCE69\uB2C8\uB2E4." }
      );
      assert.deepEqual(
        validateBookingResize({ booking, newDuration: 1, overlap: false }),
        { ok: true, reason: "\uBCC0\uACBD \uAC00\uB2A5\uD569\uB2C8\uB2E4." }
      );
    }
  },
  {
    name: "buildTimelineMachineIds pins every CRF-like machine to the top group",
    run() {
      const orderedRooms = [
        { id: "room-a", name: "M2-301", order: 1 },
        { id: "room-b", name: "Cell Bank", order: 2 },
        { id: "room-c", name: "M2-401", order: 3 }
      ];
      const machineIdsByRoomId = {
        "room-a": ["BSC-1540", "CRF-02"],
        "room-b": ["CRF"],
        "room-c": ["BSC-1542", "BSC-1541"]
      };
      const allMachineIds = ["BSC-1540", "CRF-02", "CRF", "BSC-1542", "BSC-1541"];
      const machineRoomIdsById = {
        "BSC-1540": "room-a",
        "CRF-02": "room-a",
        "CRF": "room-b",
        "BSC-1542": "room-c",
        "BSC-1541": "room-c"
      };

      assert.deepEqual(
        buildTimelineMachineIds({ orderedRooms, machineIdsByRoomId, allMachineIds, machineRoomIdsById }),
        ["CRF", "CRF-02", "BSC-1540", "BSC-1541", "BSC-1542"]
      );
    }
  },
  {
    name: "deriveMachineCategory extracts prefixes and falls back to other",
    run() {
      assert.equal(deriveMachineCategory("BSC-1538"), "BSC");
      assert.equal(deriveMachineCategory("CRF"), "CRF");
      assert.equal(deriveMachineCategory("INC-01"), "INC");
      assert.equal(deriveMachineCategory("1234"), "\uAE30\uD0C0");
    }
  },
  {
    name: "buildMobileReservationCategories keeps all first and CRF-like groups ahead",
    run() {
      const categories = buildMobileReservationCategories(["BSC-1538", "CRF", "BSC-1540", "INC-01"]);
      assert.deepEqual(
        categories.map(item => item.key),
        ["all", "CRF", "BSC", "INC"]
      );
      assert.deepEqual(
        categories.map(item => item.count),
        [4, 1, 2, 1]
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