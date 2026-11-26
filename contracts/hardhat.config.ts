import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: {
    version: "0.8.28",
    // The IR pipeline avoids "stack too deep" on the larger messages (ResaleSettled,
    // TicketIssued with its payment reference).
    settings: {
      viaIR: true,
      optimizer: { enabled: true, runs: 200 },
    },
  },
});
