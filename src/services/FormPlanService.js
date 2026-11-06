/**
 * Menerjemahkan soal (apa pun tipenya) menjadi rencana item Google Form, dan sebaliknya
 * membaca respons Form menjadi jawaban berformat CBT. Murni (tanpa FormApp) sehingga mudah diuji.
 * Tiap tipe soal menyumbang pemetaannya sendiri (toFormItems / fromFormAnswers).
 */
const FormPlanService = {
  /** @param {object[]} soalList soal aktif, sudah terurut. @returns {{soalId,sub,kind,title,help,choices}[]} */
  build(soalList) {
    const plan = [];
    soalList.forEach((soal, i) => {
      const n = i + 1;
      QuestionTypeRegistry.get(soal.tipe).toFormItems(soal).forEach((item) => {
        if (item.choices) {
          const seen = {};
          item.choices.forEach((c) => {
            const k = String(c).trim().toLowerCase();
            if (seen[k]) throw Errors.validation(`Soal ${n}: ada pilihan yang sama persis ("${c}"). Ubah agar unik sebelum deploy ke Google Form.`);
            seen[k] = true;
          });
        }
        plan.push(Object.assign({ soalId: soal.id, help: '' }, item, { title: `${n}. ${item.title}` }));
      });
    });
    return plan;
  },

  /** formItems per soal: {sub: formItemId}, dari rencana + id item hasil pembuatan Form. */
  itemMap(plan, itemIds) {
    const bySoal = {};
    plan.forEach((p, i) => {
      bySoal[p.soalId] = bySoal[p.soalId] || {};
      bySoal[p.soalId][p.sub] = String(itemIds[i]);
    });
    return bySoal;
  },

  /** @param valuesByItemId {itemId: respons mentah Form}. @returns {soalId: jawabanCBT} (soal tak terjawab dilewati) */
  readAnswers(soalList, valuesByItemId) {
    const out = {};
    soalList.forEach((soal) => {
      if (!soal.formItems) return;
      const raw = {};
      Object.keys(soal.formItems).forEach((sub) => { raw[sub] = valuesByItemId[soal.formItems[sub]]; });
      const ans = QuestionTypeRegistry.get(soal.tipe).fromFormAnswers(soal, raw);
      if (ans !== null && ans !== undefined && ans !== '' && !(Array.isArray(ans) && !ans.length)) out[soal.id] = FormPlanService._clip(ans);
    });
    return FormPlanService._fit(out);
  },

  _clip(v) { return typeof v === 'string' && v.length > FORM.MAX_ANSWER_CHARS ? v.slice(0, FORM.MAX_ANSWER_CHARS) : v; },

  /** Batas ukuran sel Sheets (50.000 karakter): pangkas jawaban teks bila perlu. */
  _fit(answers) {
    let json = JSON.stringify(answers);
    for (let limit = 1000; json.length > FORM.MAX_CELL_CHARS && limit >= 50; limit = Math.floor(limit / 2)) {
      Object.keys(answers).forEach((k) => { if (typeof answers[k] === 'string') answers[k] = answers[k].slice(0, limit); });
      json = JSON.stringify(answers);
    }
    return answers;
  },
};
