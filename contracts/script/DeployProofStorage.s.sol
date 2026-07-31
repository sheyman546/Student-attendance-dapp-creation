// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ProofStorage.sol";

contract DeployProofStorage is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        ProofStorage proofStorage = new ProofStorage();
        vm.stopBroadcast();
        console.log("ProofStorage deployed at:", address(proofStorage));
        console.log("Admin (deployer):", proofStorage.admin());
    }
}
