/** Bentuk respons API yang seragam: {success, data} atau {success:false, error:{code,message}}. */
const ApiResponse = {
  ok(data) { return { success: true, data: data === undefined ? null : data }; },
  fail(err) {
    return { success: false, error: { code: err.code || 'INTERNAL_ERROR', message: err.message, details: err.details || undefined } };
  },
  toJsonOutput(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  },
};
