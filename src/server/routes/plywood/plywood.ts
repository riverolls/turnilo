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

import { Timezone } from "chronoshift";
import { Request, Response, Router } from "express";
import { Dataset, Expression } from "plywood";
import { LOGGER } from "../../../common/logger/logger";
import { isQueryable } from "../../../common/models/data-cube/queryable-data-cube";
import { getDataCube } from "../../../common/models/sources/sources";
import { checkAccess } from "../../utils/datacube-guard/datacube-guard";
import { loadQueryDecorator } from "../../utils/query-decorator-loader/load-query-decorator";
import { SettingsManager } from "../../utils/settings-manager/settings-manager";
import { power } from "regression"

function estimate(key: string, data: any, day_num: int) {
  let samples: [number, number][] = [];
  let regex_str = `^${key}(\\d\\d?)$`;
  let regexp = new RegExp(regex_str);

  for (let item in data) {
    let res = regexp.exec(item);
    if (res) {
      let item_day = parseInt(res[1]);
      if (item_day > 0 && item_day < day_num && data[item] > 0) {
        samples.push([item_day, data[item]]);
      }
    }
  }
  if (samples.length > 1) {
    let result = power(samples, { precision: 5 });
    data[`estimated_${key}${day_num}`] = result.predict(day_num)[1];
  }
}

function process_data(data: any) {
  for (let key in data) {
    let regexp = new RegExp(/^estimated_ret(\d\d?)$/);
    let res = regexp.exec(key);
    if (res) {
      estimate('ret', data, parseInt(res[1]));
    }
    let regexp2 = new RegExp(/^estimated_roi(\d\d?)$/);
    let res2 = regexp2.exec(key);
    if (res2) {
      estimate('roi', data, parseInt(res2[1]));
    }
  }
}

function process_data_array(data_arr: any) {
  for (let item of data_arr) {
    process_data(item);
    if ('SPLIT' in item) {
      process_data_array(item.SPLIT.data);
    }
  }
}

export function plywoodRouter(settingsManager: Pick<SettingsManager, "anchorPath" | "getSources">) {

  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    const { dataSource, expression: expressionRaw, timezone } = req.body;
    const dataCube = req.body.dataCube || dataSource; // back compat

    if (typeof dataCube !== "string") {
      res.status(400).send({
        error: "must have a dataCube"
      });
      return;
    }

    let queryTimezone: Timezone = null;
    if (typeof timezone === "string") {
      try {
        queryTimezone = Timezone.fromJS(timezone);
      } catch (e) {
        res.status(400).send({
          error: "bad timezone",
          message: e.message
        });
        return;
      }
    }

    let parsedExpression: Expression = null;
    try {
      parsedExpression = Expression.fromJS(expressionRaw);
    } catch (e) {
      res.status(400).send({
        error: "bad expression",
        message: e.message
      });
      return;
    }

    let sources;
    try {
      sources = await settingsManager.getSources();
    } catch (e) {
      res.status(400).send({ error: "failed to get sources" });
      return;
    }

    const myDataCube = getDataCube(sources, dataCube);
    if (!myDataCube) {
      res.status(400).send({ error: "unknown data cube" });
      return;
    }

    if (!isQueryable(myDataCube)) {
      res.status(400).send({ error: "un queryable data cube" });
      return;
    }

    if (!(checkAccess(myDataCube, req.headers))) {
      res.status(403).send({ error: "access denied" });
      return;
    }

    const maxQueries = myDataCube.maxQueries;
    const decorator = loadQueryDecorator(myDataCube, settingsManager.anchorPath, LOGGER);
    const expression = decorator(parsedExpression, req);
    try {
      const data: any = await myDataCube.executor(expression, { maxQueries, timezone: queryTimezone });
      const reply = {
        result: Dataset.isDataset(data) ? data.toJS() : data
      };
      process_data_array(reply.result.data);
      res.json(reply);
    } catch (error) {
      console.log("error:", error.message);
      if (error.hasOwnProperty("stack")) {
        console.log((<any>error).stack);
      }
      res.status(500).send({
        error: "could not compute",
        message: error.message
      });
    }
  });

  return router;
}
