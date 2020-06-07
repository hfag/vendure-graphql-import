import fs from "fs";
import util from "util";
import url from "url";
import path from "path";
import rimraf from "rimraf";
import { pipeline } from "stream";
import fetch from "node-fetch";

export const getFilenameFromUrl = (fileUrl: string) => {
  const parsed = url.parse(fileUrl);
  if (!parsed || !parsed.pathname) {
    return fileUrl;
  }

  return path.basename(parsed.pathname);
};

export const isValidUrl = (s: string) => {
  try {
    new URL(s);
    return true;
  } catch (err) {
    return false;
  }
};

const streamPipeline = util.promisify(pipeline);

export const downloadFile = async (fileUrl: string, fileDirectory: string) => {
  const f = `${fileDirectory}/${getFilenameFromUrl(fileUrl)}`;

  const response = await fetch(fileUrl);
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
