# dsh-locale-ru

Russian language pack for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web GUI.

English | [Русский](#русский)

> **Unofficial community language pack** — not affiliated with DeepSeek.
> Translation is AI-assisted; reports of awkward wording are welcome in Issues.

Adds **Русский** to Settings → General → Language and translates the whole
interface: chat, settings, sidebar, document previews, tools, and more —
57 locale namespaces, ~2500 strings. English remains the fallback: any string
missing a translation is shown in English, so the UI never breaks.

Tested with DSH `0.2.1-rc.2` (see `engines.dsh` in `package.json`).

## Install

From GitHub, via the bundled DSH CLI:

```cmd
dsh plugin --profile desktop add github:xzdes/dsh-locale-ru
```

or through the sidebar → **Plugins** page, pasting the same spec.
Then restart DeepSeek Harness and pick **Settings → General → Language →
Русский**.

## Uninstall

Sidebar → **Plugins** → remove the bundle, or:

```cmd
dsh plugin --profile desktop remove dsh-locale-ru
```

## How it works

DeepSeek Harness is built on Cordis plugins, and its locale package
(`@deepseek-ai/dsh-client-locale`) officially supports external language
packs. This is a client-side plugin: it registers the `ru` language via
`ctx.locale.addLanguage(...)` and one dictionary per UI namespace via
`ctx.locale.register(ns, 'ru', {...})`. Optional auto-translation captures plugin UI dictionaries locally and writes results to a separate `ru-auto` locale so it never conflicts with existing `ru` registrations. It is disabled by default; requests are sent only after you configure a provider and explicitly start a scan. No application files are modified.

## Repository layout

```
dsh-locale-ru/
├── package.json       manifest: dsh.client, dsh.bundle, engines.dsh
├── cordis.patch.yml   bundle patch layer (inserts the plugin entry)
├── lib/
│   ├── index.js       host half (Plugins page display metadata)
│   └── client.js      web bundle: language + 57 dictionaries
└── tools/             translation pipeline (re-harvest + regenerate)
```

## Updating the translation for a new DSH version

See [tools/README.md](tools/README.md): re-harvest the dictionaries from the
installed app, translate the delta, regenerate `lib/client.js`.

## License

MIT. Interface strings remain the property of the DeepSeek Harness authors
(MIT); this pack provides community translations of them.

---

## Русский

Русский языковой пакет для веб-интерфейса DeepSeek Harness: добавляет
**Русский** в Настройки → General → Language и переводит весь интерфейс
(57 словарей, ~2500 строк). Непереведённые строки безопасно показываются
на английском.

Проверено на DSH `0.2.1-rc.2`. Автоперевод плагинов отключён по умолчанию; он включается отдельно в Настройки → General.

### Установка

```cmd
dsh plugin --profile desktop add github:xzdes/dsh-locale-ru
```

либо через боковую панель → **Plugins**, указав тот же адрес. После установки
перезапустите DeepSeek Harness и выберите язык в настройках.

Плагин работает только через публичный API локализации и не изменяет файлы
приложения. Подробности — в английском разделе выше.
