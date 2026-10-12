/**
 * dsh-locale-ru — host (Node) half.
 *
 * This plugin contributes browser-side dictionaries only, so the host plugin
 * body is intentionally empty. The web bundle ships through
 * `exports["./client"]` and the `dsh.client` declaration in package.json.
 *
 * The exported `meta` supplies localized display metadata for the
 * Plugins page (LocalizedText: language maps with a required `en` fallback).
 */

export const meta = {
  title: {
    en: "Russian language pack",
    ru: "Русский языковой пакет",
    zh: "俄语语言包",
  },
  description: {
    en: "Adds Russian (Русский) to the web GUI language selector and translates the entire interface: chat, settings, sidebar, tools and more.",
    ru: "Добавляет русский язык в выбор языков веб-интерфейса и переводит весь интерфейс: чат, настройки, боковую панель, инструменты и другое.",
    zh: "在界面语言列表中添加俄语，并翻译整个界面：聊天、设置、侧边栏、工具等。",
  },
};

/** Host plugin body — this package contributes browser dictionaries only. */
export function apply() {}
