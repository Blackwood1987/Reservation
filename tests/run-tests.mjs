import assert from "node:assert/strict";
import {
  buildTimelineMachineIds,
  clampHour,
  formatTime,
  hasBookingOverlap,
  snapToHalfHour
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
