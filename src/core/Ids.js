const Ids = {
  /** ID pendek, mis. "ujn_3fa91c2b". */
  next(prefix) { return `${prefix}_${CryptoUtil.randomString(8, 'abcdef0123456789')}`; },
};
