/*
 * Copyright 2015-2016 Imply Data, Inc.
 * Copyright 2017-2019 Allegro.pl
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Request, Response, Router } from "express";
import { getTitle } from "../../../common/models/customization/customization";
import { SettingsManager } from "../../utils/settings-manager/settings-manager";
import { mainLayout } from "../../views";

export function turniloRouter(settings: Pick<SettingsManager, "appSettings" | "getTimekeeper">, version: string) {
  const appSettings = settings.appSettings;

  const router = Router();

  router.get("/", async (req: Request, res: Response) => {
    try {
      res.send(mainLayout({
        version,
        title: getTitle(appSettings.customization, version),
        appSettings,
        timekeeper: settings.getTimekeeper()
      }));
    } catch (e) {
      res.status(400).send({ error: "Couldn't load Riveroll Crystal Ball Application" });
    }
  });

  return router;
}
