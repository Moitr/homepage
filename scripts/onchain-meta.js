'use strict';

const fields = {
  wallet_address: 'ONCHAIN_WALLET_ADDRESS',
  block_height: 'ONCHAIN_BLOCK_HEIGHT',
  latest_block_height: 'ONCHAIN_LATEST_BLOCK_HEIGHT',
  transaction_hash: 'ONCHAIN_TRANSACTION_HASH',
  contract_address: 'ONCHAIN_CONTRACT_ADDRESS'
};

hexo.extend.helper.register('onchain_meta', (fallback = {}) => {
  return Object.fromEntries(
    Object.entries(fields).map(([field, environmentName]) => [
      field,
      String(process.env[environmentName] || fallback[field] || '').trim()
    ])
  );
});
