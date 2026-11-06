const Shuffle = {
  /** Fisher-Yates dengan sumber acak aman. Mengembalikan salinan. */
  array(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const bytes = CryptoUtil.randomBytes(2);
      const j = ((bytes[0] << 8) | bytes[1]) % (i + 1);
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  },
};
