/**
 * Satu-satunya tempat yang menyentuh FormApp. Mengganti ini (mis. ke Forms REST API) tidak
 * mempengaruhi service lain. Semua id item dikembalikan sebagai string.
 */
class FormGateway {
  /**
   * Buat form baru atau bangun ulang isi form yang sudah ada (respons lama tetap ada).
   * @param {{title,description,shuffle,accepting,plan,existingFormId?}} o
   */
  deploy(o) {
    const form = o.existingFormId ? FormApp.openById(o.existingFormId) : FormApp.create(o.title);
    if (o.existingFormId) {
      form.getItems().map((_, i) => i).reverse().forEach((i) => form.deleteItem(i));
    }
    form.setTitle(o.title);
    form.setDescription(o.description || '');
    form.setConfirmationMessage('Jawaban Anda telah terkirim. Anda boleh menutup halaman ini.');
    this._tryAll(form, [
      ['setShowLinkToRespondAgain', false], ['setAllowResponseEdits', false], ['setCollectEmail', false],
      ['setLimitOneResponsePerUser', false], ['setProgressBar', true], ['setPublishingSummary', false],
      ['setShuffleQuestions', !!o.shuffle],
    ]);
    // Form harus bisa diisi tanpa login Google (khusus Workspace; kebijakan admin domain bisa membatasi).
    this._tryAll(form, [['setRequireLogin', false]]);

    const nis = form.addTextItem().setTitle(FORM.NIS_TITLE).setRequired(true);
    const nama = form.addTextItem().setTitle(FORM.NAMA_TITLE).setRequired(true);
    form.addPageBreakItem().setTitle('Soal Ujian');

    const itemIds = o.plan.map((p) => String(this._addItem(form, p).getId()));

    if (typeof form.setPublished === 'function') { try { form.setPublished(true); } catch (e) { /* tidak tersedia */ } }
    form.setAcceptingResponses(!!o.accepting);
    return {
      formId: form.getId(), formUrl: form.getPublishedUrl(), formEditUrl: form.getEditUrl(),
      nisItemId: String(nis.getId()), namaItemId: String(nama.getId()), itemIds,
    };
  }

  _tryAll(form, calls) {
    calls.forEach(([fn, arg]) => {
      try { if (typeof form[fn] === 'function') form[fn](arg); } catch (e) { Log.warn(`FormApp.${fn} gagal`, { error: String(e) }); }
    });
  }

  _addItem(form, p) {
    let item;
    switch (p.kind) {
      case 'choice': item = form.addMultipleChoiceItem(); break;
      case 'checkbox': item = form.addCheckboxItem(); break;
      case 'dropdown': item = form.addListItem(); break;
      case 'paragraph': item = form.addParagraphTextItem(); break;
      default: item = form.addTextItem();
    }
    item.setTitle(p.title);
    if (p.help) item.setHelpText(p.help);
    if (p.choices) item.setChoices(p.choices.map((c) => item.createChoice(c)));
    item.setRequired(false);
    return item;
  }

  setAccepting(formId, accepting) {
    FormApp.openById(formId).setAcceptingResponses(!!accepting);
  }

  /** Link form dengan NIS & Nama terisi otomatis untuk siswa tertentu. */
  prefilledUrl({ formId, nisItemId, namaItemId, nis, nama }) {
    const form = FormApp.openById(formId);
    const resp = form.createResponse();
    resp.withItemResponse(form.getItemById(Number(nisItemId)).asTextItem().createResponse(String(nis)));
    resp.withItemResponse(form.getItemById(Number(namaItemId)).asTextItem().createResponse(String(nama)));
    return resp.toPrefilledUrl();
  }

  /**
   * @param {string} formId
   * @param {string=} afterIso hanya respons SETELAH waktu ini (sinkron inkremental, jauh lebih cepat)
   * @returns {{id, timestamp(ISO), answers:{itemId: respons mentah}}[]}
   */
  readResponses(formId, afterIso) {
    const form = FormApp.openById(formId);
    const list = afterIso ? form.getResponses(new Date(afterIso)) : form.getResponses();
    return list.map((r) => {
      const answers = {};
      r.getItemResponses().forEach((ir) => { answers[String(ir.getItem().getId())] = ir.getResponse(); });
      return { id: r.getId(), timestamp: r.getTimestamp().toISOString(), answers };
    });
  }
}
