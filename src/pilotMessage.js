// Pure builder for the Retamim pilot interest message (ESM; page loads it as a module).
// No data is stored anywhere; the user sends the message themselves via WhatsApp.
function clean(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max || 200);
}

export function buildMessage(input) {
  var lines = [
    'שלום! אני מעוניין/ת בחברותא במסגרת הפיילוט בשכונה.',
    'שם: ' + clean(input.name, 80),
    'נושא לימוד: ' + clean(input.topic, 120),
    'רמה: ' + clean(input.level, 60),
    'ימים מתאימים: ' + clean(input.days, 120),
    'שעות מתאימות: ' + clean(input.hours, 120),
    'אופן לימוד: ' + clean(input.mode, 60)
  ];
  var notes = clean(input.notes, 500);
  if (notes) lines.push('הערות: ' + notes);
  return lines.join('\n');
}

export function isValid(input) {
  return clean(input.name, 80).length >= 2 && clean(input.topic, 120).length >= 2;
}

export function whatsappUrl(phoneE164Digits, message) {
  var digits = String(phoneE164Digits || '').replace(/\D/g, '');
  if (!digits) return '';
  return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(message);
}
