# Публикация dsh-locale-ru: инструкция

Проверено по официальным источникам на 12.10.2026 (DSH 0.2.0-rc.2).

## Куда вообще публиковать: карта вариантов

### 1. Свой GitHub-репозиторий — основной путь ✅

Установка плагина из git поддерживается штатно:

```cmd
dsh plugin --profile desktop add github:<user>/dsh-locale-ru
```

Темы (topics) для репозитория — по ним ищут плагины: `dsh-plugin`, `deepseek-harness`, `dsh`, `localization`, `russian`, `i18n`.

### 2. awesome-dsh-plugin — community-реестр ✅

[github.com/awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) —
курируемый список плагинов DSH (~18k звёзд, PR принимаются, лицензия CC0).
Это де-факто «витрина» экосистемы: топик `dsh-plugin` на GitHub насчитывает
18+ тыс. репозиториев, и awesome-список — главный навигатор по ним.
Формат PR: добавить строку в таблицу по их шаблону (название, ссылка, описание).

### 3. Официальный репозиторий deepseek-ai/deepseek-harness ⚠️ с оговорками

Факты о репозитории (GitHub API, ветка `master`):

- **Issues выключены** (`has_issues: false`)
- **Pull Requests выключены** (`has_pull_requests: false`)
- **Discussions включены** — единственный открытый канал

Кукбук `docs/cookbook/adding-a-package.md` описывает добавление пакета
**в сам монорепозиторий** как `@deepseek-ai/dsh-*` — с жёсткими инвариантами
(`private: true`, версия = версии корня, обязательные peer+dev зависимости,
контракт README с разделом Model Experience, гейты `pnpm run constraints`,
`verify-package-meta`, тестовая политика). Это путь для first-party пакетов
команды DeepSeek, а не для community-переводов, и PR туда всё равно закрыты.

Реалистично: пост в **Discussions** (категория Show and tell / General) со
скриншотами и ссылкой на ваш репозиторий. Если команда захочет взять
локализацию в поставку — они выйдут на связь сами.

### 4. npm (опционально)

Публикация в npm даёт самую короткую установку:

```cmd
dsh plugin --profile desktop add dsh-locale-ru
```

Имя `dsh-locale-ru` свободно на момент проверки — проверьте `npm view dsh-locale-ru`.
Если не хотите возиться с npm — git-установка из п.1 полностью достаточна.

## Стоит ли публиковать: честная оценка

**За:**
- Это, судя по всему, первый публичный языковой пакет DSH — и единственный
  способ получить русский интерфейс
- Плагин технически чистый: только публичный API (`locale.addLanguage` /
  `locale.register`), без патчей приложения
- Экосистема молодая (DSH 0.2.0-rc.2), ранние плагины получают заметность

**Издержки (примите осознанно):**
- **Сопровождение.** 2503 строки соответствуют DSH 0.2.0-rc.2. Каждый релиз
  может добавить/переименовать ключи. Непереведённое безопасно падает в
  английский, но перевод будет «протухать» без обновлений.
- `engines.dsh` сейчас pinned на `0.2.0-rc.2` — на других версиях установка
  будет отклоняться (или потребует exemption). Расширяйте диапазон только
  после реальной проверки на новой версии.
- Перевод машинный (AI) — честно пометьте это в README; нейтив-вычитка
  повысит доверие и звёзды.
- Юридически: строки интерфейса — производная от контента DSH (MIT).
  Укажите в README: «unofficial community language pack, not affiliated
  with DeepSeek».

**Вывод: да, публиковать стоит** — через свой GitHub + PR в awesome-список.
В монорепозиторий не цельтесь: канал закрыт, планка несоответствует задаче.

## Пошаговая инструкция

### Шаг 1. Подготовьте репозиторий

Минимальный состав (уже есть): `package.json`, `lib/index.js`,
`lib/client.js`, `cordis.patch.yml`, `README.md`.

Добавьте:

- `LICENSE` — MIT (как у самого DSH)
- `README.md` — сделайте двуязычным: английский блок первым (международная
  аудитория awesome-списка), русский ниже. Добавьте **скриншоты** интерфейса
  на русском — это главный конверсионный фактор
- `.gitignore`:
  ```
  node_modules/
  *.log
  .DS_Store
  Thumbs.db
  ```
- `tools/` — крайне рекомендую включить tooling обновления перевода
  (лежит в `C:\Users\xzdes\Documents\deepseek-harness\default-workspace\.research`):
  - `harvest.cjs` — извлекает все словари из установленного DSH
  - `generate-client.cjs` — собирает `lib/client.js` из переводов с валидацией
  - `export-ru.cjs` — обратная выгрузка `lib/client.js` → `ru-chunk-*.json`
  - `ru-chunk-*.json` — версионируемый исходник перевода (редактируется вручную)
  - `namespaces.json` — слепок en/zh строк текущей версии
  Без них обновление под новую версию DSH превратится в ручную боль.
- `CHANGELOG.md` — начните с `1.0.0` и строки «Initial release: full Russian
  translation for DSH 0.2.0-rc.2 (57 namespaces, 2503 keys)»

Проверьте `package.json`: поля `repository`, `keywords`
(`["dsh-plugin", "deepseek-harness", "i18n", "russian", "localization"]`),
`author`, `homepage` — npm и GitHub их показывают.

### Шаг 2. Git + GitHub

```cmd
cd /d S:\dsh-locale-ru
git init
git add .
git commit -m "Initial release: Russian language pack for DSH 0.2.0-rc.2"
git branch -M main
git remote add origin https://github.com/<user>/dsh-locale-ru.git
git push -u origin main
```

Репозиторий создайте на github.com/new (public, без инициализации файлами).
После пуша: Settings репозитория → Topics → добавьте `dsh-plugin` и др.

### Шаг 3. Релиз

GitHub → Releases → Draft a new release → тег `v1.0.0` → описание из
CHANGELOG. Теги важны: установка из git может ссылаться на конкретный тег.

### Шаг 4. PR в awesome-список

1. Fork `awesome-dsh-plugin/awesome-dsh-plugin`
2. Добавьте строку в их таблицу плагинов (посмотрите формат существующих
   записей — обычно: название со ссылкой | короткое описание | автор)
3. PR с заголовком вида `Add dsh-locale-ru (Russian language pack)`

### Шаг 5. Discussions официального репозитория

Пост в [github.com/deepseek-ai/deepseek-harness/discussions](https://github.com/deepseek-ai/deepseek-harness/discussions):
коротко, на английском, 2–3 скриншота, ссылка на репозиторий, упоминание,
что пакет использует документированный `ctx.locale.addLanguage` API.
Не просите «включить в поставку» в лоб — спросите, планируют ли они
механизм community-локалей; это полезный сигнал для них и мягкая заявка.

### Шаг 6 (опционально). npm

```cmd
npm login
cd /d S:\dsh-locale-ru
npm publish --access public
```

## Цикл обновления под новые версии DSH

1. Обновите DSH, запустите `node tools/harvest.cjs` против новой установки —
   получите новый `namespaces.json`
2. `node tools/generate-client.cjs tools .` покажет `MISSING`/`UNKNOWN` ключи —
   это и есть дельта
3. Переведите дельту, поднимите `version` (semver) и при необходимости
   `engines.dsh`
4. CHANGELOG → git tag → GitHub Release → (npm publish)

## Проверка установки «как у пользователя»

Перед анонсом попросите кого-нибудь (или сами на чистом профиле):

```cmd
dsh plugin --profile <test> add github:<user>/dsh-locale-ru
```

и убедитесь, что русский появляется в Settings → General → Language.
