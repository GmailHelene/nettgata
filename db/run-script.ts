/**
 * Kjører et skript og avslutter rolig. process.exit() midt i lukking av nettverkstilkoblinger
 * krasjer Node på Windows (libuv-assert), så vi setter bare exitCode og lar prosessen ebbe ut.
 * PGlite holder prosessen i live, derfor en reserve som avslutter etter ti sekunder
 * (lenger enn fetch sin keep-alive, så tilkoblinger mot Neon rekker å lukke seg selv).
 */
export function runScript(main: () => Promise<void>) {
  main()
    .then(() => {
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => {
      setTimeout(() => process.exit(), 10_000).unref();
    });
}
