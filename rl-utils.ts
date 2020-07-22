import { Writable } from "stream";
import * as readline from "readline";

export const mutableStdout = new Writable({
  write: function (chunk, encoding, callback) {
    //@ts-ignore
    if (!this.muted) process.stdout.write(chunk, encoding);
    callback();
  },
});

export const rl = readline.createInterface({
  input: process.stdin,
  output: mutableStdout,
  terminal: true,
});

export const rlQuestion = (question: string) =>
  new Promise<string>((resolve, reject) =>
    rl.question(question, (answer) => resolve(answer))
  );
export const rlPasword = (question: string) =>
  new Promise<string>((resolve, reject) => {
    //@ts-ignore
    mutableStdout.muted = false;
    rl.question(question, (answer) => {
      //@ts-ignore
      mutableStdout.muted = false;
      resolve(answer);
    });
    //@ts-ignore
    mutableStdout.muted = true;
  });

export const rlConfirm = (question: string, defaultAnswer = "n") =>
  new Promise<boolean>((resolve, reject) => {
    const defaultTrue = "y" === defaultAnswer;
    const nonDefault = defaultTrue ? "n" : "y";

    rl.question(
      question + ` (${defaultTrue ? "Y" : "y"}/${!defaultTrue ? "N" : "n"}) `,
      (answer) => {
        if (answer.toLowerCase() === nonDefault) {
          resolve(!defaultTrue);
        } else {
          resolve(defaultTrue);
        }
      }
    );
  });
export const assertConfirm = async (
  question: string,
  defaultAnswer?: string
) => {
  if (await rlConfirm(question, defaultAnswer)) {
    return;
  } else {
    console.log("Nicht bestätigt, beende das Programm.");
    process.exit();
  }
};

export const selection = async <T>(
  text: string,
  options: T[],
  mapOption: (option: T) => any = (e: T) => e,
  allowNone = false
) => {
  console.log(text);
  options.forEach((option, index) =>
    console.log(`${index}) `, mapOption(option))
  );
  if (allowNone) {
    console.log(`${options.length}) Nichts davon.`);
  }
  let answer = parseInt(await rlQuestion(`Auswahl: `));
  while (
    isNaN(answer) ||
    answer < 0 ||
    answer >= (allowNone ? options.length + 1 : options.length)
  ) {
    console.log(
      `Diese Antwort ist ungültig. Wähle eine Zahl zwischen 0 und ${
        allowNone ? options.length : options.length - 1
      }`
    );
    answer = parseInt(await rlQuestion(`Auswahl: `));
  }

  return options[answer] || null;
};
