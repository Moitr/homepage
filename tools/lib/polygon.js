'use strict';

const { getAddress } = require('ethers');

const POLYGON_CHAIN_ID = 137n;
const POLYGON_RPC_URL = 'https://polygon.drpc.org';
const POLYGON_EXPLORER_URL = 'https://polygonscan.com';
const DETERMINISTIC_DEPLOYER = getAddress('0x4e59b44847b379578588920cA78FbF26c0B4956C');

module.exports = {
  POLYGON_CHAIN_ID,
  POLYGON_EXPLORER_URL,
  POLYGON_RPC_URL,
  DETERMINISTIC_DEPLOYER
};
