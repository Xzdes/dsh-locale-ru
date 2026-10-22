# dsh-locale-ru

Russian language pack for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web GUI.

English | [Русский](#русский)

> **Unofficial community language pack** — not affiliated with DeepSeek.
> Translation is AI-assisted; reports of awkward wording are welcome in Issues.

Adds **Русский** to Settings → General → Language and translates the whole
interface: chat, settings, sidebar, document previews, tools, and more —
57 locale namespaces, ~2500 strings. English remains the fallback: any string
missing a translation is shown in English, so the UI never breaks.

Tested with DSH `0.2.0-rc.2` (see `engines.dsh` in `package.json`).

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
`ctx.locale.register(ns, 'ru', {...})`. No application files are modified.

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

## Automatic translation of other plugins (optional)

The pack can also **collect dictionaries from installed plugins and translate
new strings through a model**. The feature is opt-in and disabled by default.

1. After installing the pack, open **Settings → General → Language** and find
   the **Автоматический перевод плагинов** row.
2. Enter your API key (password), model name and endpoint.
3. Click **Перевести новые строки**. New strings are sent in batches; results
   are cached locally on this device and applied immediately.

Only strings from `ctx.locale.register` dictionaries are collected — chat
content, file paths and secrets are never sent. See
[tools/auto-translate.md](tools/auto-translate.md) for the full design.

## License

MIT. Interface strings remain the property of the DeepSeek Harness authors
(MIT); this pack provides community translations of them.

---

## Русский

Русский языковой пакет для веб-интерфейса DeepSeek Harness: добавляет
**Русский** в Настройки → General → Language и переводит весь интерфейс
(57 словарей, ~2500 строк). Непереведённые строки безопасно показываются
на английском.

Проверено на DSH `0.2.0-rc.2`.

### Установка

```cmd
dsh plugin --profile desktop add github:xzdes/dsh-locale-ru
```

либо через боковую панель → **Plugins**, указав тот же адрес. После установки
перезапустите DeepSeek Harness и выберите язык в настройках.

Плагин работает только через публичный API локализации и не изменяет файлы
приложения. Подробности — в английском разделе выше.

### Автоматический перевод плагинов (опционально)

После установки в **Настройки → General → Language** появится строка
**Автоматический перевод плагинов**. Там можно указать модель, endpoint и
API-ключ, затем нажать **Перевести новые строки** — плагин соберёт словари
установленных плагинов и переведёт отсутствующие строки через нейросеть.
Результаты кэшируются локально на этом устройстве и применяются сразу.
Переводятся только строки из `ctx.locale.register`; чат, пути и пароли не
отправляются. Подробности — в [tools/auto-translate.md](tools/auto-translate.md).
