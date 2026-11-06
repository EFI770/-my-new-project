import { rankCandidates, toPublicCandidateCard } from "../src/domain/mutualSelection.js";

// Fictional data only. interestedInYou is a mock UX signal, not real private data.
// No network, persistent storage, phone numbers, or messages are used.
const demoCandidates = [
  { id:"demo-1", displayName:"דוד (דוגמה)", topic:"Shabbat", level:"intermediate", times:["evening"], about:"מחפש לימוד קבוע בקצב מסודר.", active:true, interestedInYou:true },
  { id:"demo-2", displayName:"משה (דוגמה)", topic:"Berachot", level:"beginner", times:["morning"], about:"רוצה לבנות יסודות ולהבין את מהלך הסוגיה.", active:true, interestedInYou:false },
  { id:"demo-3", displayName:"יוסף (דוגמה)", topic:"Chassidut", level:"intermediate", times:["evening","afternoon"], about:"מעוניין בלימוד חסידות עם עיון ושיחה.", active:true, interestedInYou:true },
  { id:"demo-4", displayName:"אברהם (דוגמה)", topic:"Shabbat", level:"advanced", times:["afternoon"], about:"מחפש חברותא ללימוד בעיון.", active:true, interestedInYou:false },
];
const topicNames = { Shabbat:"מסכת שבת", Berachot:"מסכת ברכות", Chassidut:"חסידות" };
const levelNames = { beginner:"מתחילים", intermediate:"בינוני", advanced:"מתקדם" };
const timeNames = { morning:"בוקר", afternoon:"אחר הצהריים", evening:"ערב" };
const selected = new Set();
let confirmedContactFor = null;
const list = document.querySelector("#candidate-list");
const count = document.querySelector("#count");
const topicSelect = document.querySelector("#topic");
const timeSelect = document.querySelector("#time");
const mutualSection = document.querySelector("#mutual-section");
const mutualCopy = document.querySelector("#mutual-copy");
const contactConsent = document.querySelector("#contact-consent");
const confirmContact = document.querySelector("#confirm-contact");
const contactStatus = document.querySelector("#contact-status");

function render() {
  const preferences = {
    topics: topicSelect.value === "all" ? [] : [topicSelect.value],
    times: timeSelect.value === "all" ? [] : [timeSelect.value],
  };
  const candidates = rankCandidates(demoCandidates, preferences)
    .filter((candidate) => preferences.topics.length === 0 || preferences.topics.includes(candidate.topic))
    .filter((candidate) => preferences.times.length === 0 || candidate.times.some((time) => preferences.times.includes(time)));
  count.textContent = candidates.length + " מועמדים";
  if (candidates.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "לא נמצאו מועמדים לפי הסינון הזה. אפשר לבחור נושא או זמן אחר.";
    list.replaceChildren(empty);
  } else {
    list.replaceChildren(...candidates.map((candidate) => {
      const card = toPublicCandidateCard(candidate);
      const article = document.createElement("article");
      article.className = "candidate";
      const info = document.createElement("div");
      const name = document.createElement("h3");
      name.textContent = card.displayName;
      const details = document.createElement("p");
      details.textContent = (topicNames[card.topic] || card.topic) + " · " + (levelNames[card.level] || card.level);
      const about = document.createElement("p");
      about.textContent = card.about;
      const tags = document.createElement("div");
      tags.className = "tags";
      card.times.forEach((time) => {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = timeNames[time] || time;
        tags.append(tag);
      });
      info.append(name, details, about, tags);
      const button = document.createElement("button");
      button.type = "button";
      button.className = selected.has(candidate.id) ? "secondary selected" : "primary";
      button.textContent = selected.has(candidate.id) ? "נבחר ✓" : "מעניין אותי";
      button.setAttribute("aria-pressed", String(selected.has(candidate.id)));
      button.addEventListener("click", () => {
        if (selected.has(candidate.id)) selected.delete(candidate.id);
        else selected.add(candidate.id);
        if (!selected.has(candidate.id) && confirmedContactFor === candidate.id) {
          confirmedContactFor = null;
          contactConsent.checked = false;
          contactStatus.textContent = "";
        }
        render();
      });
      article.append(info, button);
      return article;
    }));
  }
  const mutual = candidates.find((candidate) => selected.has(candidate.id) && candidate.interestedInYou);
  mutualSection.hidden = !mutual;
  if (mutual) {
    mutualSection.dataset.candidateId = mutual.id;
    mutualCopy.textContent = "בהדגמה זו, " + mutual.displayName + " גם הביע/ה עניין. במערכת אמיתית, הנתון יגיע מהשרת ורק לאחר בדיקת הרשאות. עדיין לא נחשפו פרטי קשר.";
    confirmContact.textContent = confirmedContactFor === mutual.id ? "ההסכמה ניתנה" : "אישור רצון ליצור קשר";
    confirmContact.disabled = !contactConsent.checked || confirmedContactFor === mutual.id;
  } else {
    mutualSection.dataset.candidateId = "";
    contactConsent.checked = false;
    contactStatus.textContent = "";
    confirmedContactFor = null;
  }
}
topicSelect.addEventListener("change", render);
timeSelect.addEventListener("change", render);
contactConsent.addEventListener("change", () => {
  confirmContact.disabled = !contactConsent.checked || confirmedContactFor === mutualSection.dataset.candidateId;
});
confirmContact.addEventListener("click", () => {
  const id = mutualSection.dataset.candidateId;
  const candidate = demoCandidates.find((item) => item.id === id);
  if (!candidate || !selected.has(id) || !candidate.interestedInYou || !contactConsent.checked) return;
  confirmedContactFor = id;
  contactStatus.textContent = "ההסכמה נרשמה בהדגמה בלבד. לא נשלחה הודעה ולא נפתח WhatsApp.";
  confirmContact.textContent = "ההסכמה ניתנה";
  confirmContact.disabled = true;
});
render();
