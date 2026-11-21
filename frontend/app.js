const TYPES = {
  events: { endpoint: "/api/v1/events", label: "СОБЫТИЕ", title: "События" },
  artists: { endpoint: "/api/v1/artists", label: "АРТИСТ", title: "Артисты" },
  venues: { endpoint: "/api/v1/venues", label: "ПЛОЩАДКА", title: "Площадки" },
  series: { endpoint: "/api/v1/series", label: "СЕРИЯ", title: "Серии" }
};

const form = document.querySelector("#search-form");
const input = document.querySelector("#search-input");
const button = document.querySelector("#search-button");
const resultsArea = document.querySelector("#results-area");
const welcome = document.querySelector("#welcome");
const statusNode = document.querySelector("#status");
let activeController = null;

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["items", "results", "data"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function totalCount(payload, items) {
  const value = payload?.total ?? payload?.total_count ?? payload?.count;
  return Number.isFinite(Number(value)) ? Number(value) : items.length;
}

function firstValue(...values) {
  return values.find(value => value !== undefined && value !== null && String(value).trim() !== "");
}

function dateText(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Moscow"
  }).format(date);
}

function detailsFor(type, item) {
  if (type === "events") {
    return {
      title: firstValue(item.title, item.name, "Без названия"),
      description: firstValue(item.description, item.annotation, "Описание не указано"),
      meta: [
        dateText(firstValue(item.starts_at, item.start_at, item.event_date)),
        firstValue(item.venue?.name, item.venue_name),
        firstValue(item.artist?.name, item.artist_name),
        item.price_rub != null ? `${item.price_rub} ₽` : null,
        item.age_rating != null ? `${item.age_rating}+` : null
      ]
    };
  }
  if (type === "artists") {
    return {
      title: firstValue(item.name, item.title, "Артист без названия"),
      description: firstValue(item.description, "Информация об артисте не указана"),
      meta: [item.primary_genre_code, item.kind === "group" ? "Группа" : null]
    };
  }
  if (type === "venues") {
    return {
      title: firstValue(item.name, item.title, "Площадка без названия"),
      description: firstValue(item.address, item.description, "Адрес не указан"),
      meta: [item.district_code, item.capacity != null ? `Вместимость: ${item.capacity}` : null,
        item.has_coordinates === false ? "Нет координат" : null]
    };
  }
  return {
    title: firstValue(item.name, item.title, "Серия без названия"),
    description: firstValue(item.description, "Описание серии не указано"),
    meta: [item.status, item.events_count != null ? `Событий: ${item.events_count}` : null]
  };
}

function makeCard(type, item) {
  const details = detailsFor(type, item);
  const article = document.createElement("article");
  article.className = "result-card";

  const top = document.createElement("div");
  top.className = "card-top";
  const label = document.createElement("span");
  label.className = "type-label";
  label.textContent = TYPES[type].label;
  const id = document.createElement("span");
  id.className = "card-id";
  id.textContent = item.id ? `ID: ${item.id}` : "";
  top.append(label, id);

  const title = document.createElement("h4");
  title.textContent = details.title;
  const description = document.createElement("p");
  description.textContent = details.description;

  const meta = document.createElement("div");
  meta.className = "card-meta";
  details.meta.filter(Boolean).forEach(value => {
    const tag = document.createElement("span");
    tag.textContent = String(value);
    meta.append(tag);
  });

  article.append(top, title, description);
  if (meta.childElementCount) article.append(meta);
  return article;
}

function renderSection(type, payload) {
  const items = asArray(payload);
  const cards = document.querySelector(`#cards-${type}`);
  cards.replaceChildren();
  document.querySelector(`#count-${type}`).textContent = items.length;
  document.querySelector(`#total-${type}`).textContent =
    `Найдено: ${totalCount(payload, items)}`;

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "В этой категории ничего не найдено.";
    cards.append(empty);
    return;
  }
  items.forEach(item => cards.append(makeCard(type, item)));
}

async function fetchCategory(type, query, signal) {
  const url = new URL(TYPES[type].endpoint, window.location.origin);
  url.searchParams.set("q", query);
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "12");
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      message = body.detail || body.message || message;
    } catch (_) {}
    throw new Error(message);
  }
  return response.json();
}

function setActiveTab(type) {
  document.querySelectorAll(".tab").forEach(tab =>
    tab.classList.toggle("active", tab.dataset.target === type));
  document.querySelectorAll(".result-section").forEach(section =>
    section.classList.toggle("active", section.id === `section-${type}`));
}

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => setActiveTab(tab.dataset.target));
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) {
    input.focus();
    return;
  }

  if (activeController) activeController.abort();
  activeController = new AbortController();
  const { signal } = activeController;

  welcome.hidden = true;
  resultsArea.hidden = false;
  document.querySelector("#results-title").textContent = `По запросу «${query}»`;
  statusNode.className = "status";
  statusNode.textContent = "Ищем одновременно в четырёх каталогах…";
  button.disabled = true;
  button.textContent = "Поиск…";
  setActiveTab("events");

  const entries = Object.keys(TYPES);
  const responses = await Promise.allSettled(
    entries.map(type => fetchCategory(type, query, signal))
  );

  if (signal.aborted) return;

  let successCount = 0;
  const errors = [];
  responses.forEach((result, index) => {
    const type = entries[index];
    if (result.status === "fulfilled") {
      successCount += 1;
      renderSection(type, result.value);
    } else {
      document.querySelector(`#cards-${type}`).innerHTML =
        '<div class="empty">Не удалось загрузить эту категорию.</div>';
      document.querySelector(`#count-${type}`).textContent = "—";
      document.querySelector(`#total-${type}`).textContent = "";
      errors.push(`${TYPES[type].title}: ${result.reason?.message || "ошибка запроса"}`);
    }
  });

  if (successCount === 4) {
    statusNode.textContent = "Поиск завершён. Результаты разделены по типам сущностей.";
  } else if (successCount > 0) {
    statusNode.className = "status error";
    statusNode.textContent = `Часть каталогов недоступна. ${errors.join(" · ")}`;
  } else {
    statusNode.className = "status error";
    statusNode.textContent = `Не удалось получить результаты. Проверьте запуск backend. ${errors.join(" · ")}`;
  }

  button.disabled = false;
  button.innerHTML = 'Найти <span>→</span>';
});

document.querySelector("#clear-button").addEventListener("click", () => {
  if (activeController) activeController.abort();
  input.value = "";
  resultsArea.hidden = true;
  welcome.hidden = false;
  statusNode.textContent = "";
  input.focus();
});
