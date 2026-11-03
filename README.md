# myql

Приложение собирается из плагинов, package.json и есть приложение.

## Структура

- `packages/myql`: CLI (`init`, `start`), сборка на rolldown, цикл перезапуска с откатом.
- `packages/server`: `@myql/server`, HTTP, статика из `public/`, реестр `api`.
- `packages/client`: `@myql/client`, корневой HTML, перезагрузка страницы после рестарта.
- `packages/plugins`: `@myql/plugins`, установка и удаление плагинов из UI.
- `packages/hello`: пример плагина `myql-hello`.
- `demo`: приложение, собранное из этих пакетов через `file:`.
- `test-plugins`: плагины для сценариев `test/e2e.mjs` (сломанная сборка, падение при старте, обычный плагин).

## Как это работает

1. Плагины это прямые `dependencies` с именем `myql-*` или `@myql/*`.
2. `myql start` генерирует `.myql/entry-server.js` и `.myql/entry-client.js`, собирает `index.js` и `public/client.js`, запускает `node index.js`.
3. Плагин это модуль с экспортами `server` и/или `client` (функции). Серверные функции вызываются параллельно.
4. Установка из UI: дочерний процесс запускает `myql apply`, который делает `npm install`, собирает проект в `.myql/tmp`, подменяет файлы и завершается с кодом 75. `myql start` перезапускает процесс. Если новая сборка не прислала `ready`, происходит откат на `.myql/previous` вместе с package.json и lock-файлом.
5. Страница сама перезагружается после рестарта (SSE и опрос `/__myql/ping`).

## Запуск демо

```sh
cd demo
npm install      # нужен доступ к registry.npmjs.org (rolldown)
npm start        # токен менеджера плагинов печатается в лог
```

Тест: `node test/e2e.mjs` (после `npm install` в `demo`).

Если меняете код в `packages/*`, выполните `npm install` в `demo` ещё раз: `.npmrc` с `install-links=true` копирует `file:`-пакеты в `node_modules`.

## Не проверено

Код пока не запускался: в среде, где он писался, не было доступа к npm registry. Проверены только синтаксис и логика чтением. Первое, что стоит проверить: сборка rolldown (опции `platform`, `external`, `dir`), tree-shaking серверной части в клиентском бандле, перезапуск и откат.
