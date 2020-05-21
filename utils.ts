import fs from "fs";
import util from "util";
import url from "url";
import path from "path";
import rimraf from "rimraf";
import { pipeline } from "stream";
import fetch from "node-fetch";

const streamPipeline = util.promisify(pipeline);

export const downloadFile = async (fileUrl: string, fileDirectory: string) => {
  const response = await fetch(fileUrl);
  const parsed = url.parse(fileUrl);

  if (!parsed || !parsed.pathname) {
    throw new Error(`${fileUrl} is not a valid URL!`);
  }

  const f = `${fileDirectory}/${path.basename(parsed.pathname)}`;

  if (!response.ok) {
    throw new Error(`unexpected response ${response.statusText}`);
  }
  await streamPipeline(response.body, fs.createWriteStream(f));

  return f;
};

export const downloadFiles = async (
  files: string[],
  directory = "."
): Promise<string[]> => {
  if (!fs.existsSync("./tmp/")) {
    fs.mkdirSync("./tmp");
  } else {
    rimraf.sync("./tmp/*");
  }

  return (
    await Promise.all(
      files.map((url) =>
        downloadFile(url, `${directory}/tmp`).catch(
          (e) => {
            console.error(e);
            return null;
          } /* ignore errors */
        )
      )
    )
  ).filter(notEmpty);
};

export const cleanDownloads = (directory = ".") =>
  rimraf.sync(`${directory}/tmp/*`);

export function notEmpty<TValue>(
  value: TValue | null | undefined
): value is TValue {
  return value !== null && value !== undefined;
}
