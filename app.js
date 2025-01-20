import 'dotenv/config';
import express from 'express';
import queryString from 'query-string';
import httpStatus from 'http-status';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';
dayjs.extend(relativeTime);
import https from 'https';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';

const E = process.env;
const CARD = fs.readFileSync(new URL('./public/card.svg', import.meta.url), 'utf8');
const LOGO = fs.readFileSync(new URL('./public/logo.svg', import.meta.url), 'utf8');
const HEADERS = {
  'Content-Type': 'image/svg+xml',
  'Access-Control-Allow-Origin': `${E.DOMAIN || 'http://localhost'}`,
  'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept'
};

const app = express();

// 设置静态文件目录
app.use(express.static('public'));

// 请求函数
function request(pth, method='GET') {
  return new Promise((fres, frej) => {
    const opts = {
      hostname: 'ohpm.openharmony.cn',
      path: pth,
      method,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Connection': 'keep-alive',
        'Content-Type': 'application/json;charset=UTF-8',
        'Referer': 'https://ohpm.openharmony.cn/',
      }
    };
    const req  = https.request(opts, res => {
      let chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const encoding = res.headers['content-encoding'];
        
        if (encoding === 'gzip') {
          zlib.gunzip(buffer, (err, decompressed) => {
            if (err) return frej(err);
            res.body = decompressed.toString('utf8');
            fres(res);
          });
        } else if (encoding === 'deflate') {
          zlib.inflate(buffer, (err, decompressed) => {
            if (err) return frej(err);
            res.body = decompressed.toString('utf8');
            fres(res);
          });
        } else {
          res.body = buffer.toString('utf8');
          fres(res);
        }
      });
    });
    req.on('error', (e) => {
      frej(e);
    });
    req.end();
  });
}

// 解析参数
function argument(qry) {
  const width  = parseFloat(qry.width)  || 384;
  const height = parseFloat(qry.height) || 56;
  const margin = parseFloat(qry.margin) || 4;
  return {width, height, margin};
}

// 获取包信息
function getPackageInfo(name) {
  return request(`https://ohpm.openharmony.cn/ohpmweb/registry/oh-package/openapi/v1/detail/${name}`).then(res => {
    const {body: pkg} = JSON.parse(res.body);
    const {publishTime: mod} = pkg;
    const install = (pkg.preferGlobal? '-g ' : '') + pkg.name;
    const deps    = Object.keys(pkg.dependencies.rows || {}).length;
    const dependencies = deps + ' dependenc' + (deps!==1? 'ies' : 'y');
    const license = pkg.license;
    const version = pkg.version;
    const updated = dayjs(mod).fromNow();
    return {install, dependencies, license, version, updated};
  }).catch(err => {
    return {install: name, dependencies: '?', license: '?', version: '?', updated: '?'};
  });
}

// 计算 SVG 宽度
function fitWidth(org, ins, upd) {
  const iw = 110 + (12 + ins.length) * 12 * 0.63;
  const uw = 240 + upd.length        * 11 * 0.63;
  return Math.round(Math.max(org, iw, uw));
}

// 生成 SVG
function svg(arg, pkg) {
  let a = arg, p = pkg, c = CARD;
  a.width = fitWidth(a.width, p.install, p.updated);
  c = c.replace(/{{a.width([\+\-\d]+)?}}/g,  (m, p1) => `${a.width  + (parseFloat(p1) || 0)}`);
  c = c.replace(/{{a.height([\+\-\d]+)?}}/g, (m, p1) => `${a.height + (parseFloat(p1) || 0)}`);
  c = c.replace(/{{a.margin([\+\-\d]+)?}}/g, (m, p1) => `${a.margin + (parseFloat(p1) || 0)}`);
  c = c.replace(/{{p.install}}/g, p.install);
  c = c.replace(/{{p.dependencies}}/g, p.dependencies);
  c = c.replace(/{{p.license}}/g, p.license);
  c = c.replace(/{{p.version}}/g, p.version);
  c = c.replace(/{{p.updated}}/g, p.updated);
  return c.replace(/{{n.logo}}/g, LOGO);
}

// 导出 Vercel 无服务器函数
export default app;

// 处理根路径
app.get('/', (req, res) => {
  res.send(`
    <h1>OHPM Package Badge Service</h1>
    <p>Usage: /:packageName.svg</p>
    <p>Example: <a href="/@pura/harmony-utils.svg">/@pura/harmony-utils.svg</a></p>
  `);
});

// 处理 SVG 请求
app.get('/*.svg', (req, res) => {
  const name = req.path.slice(1, -4).toLowerCase();
  getPackageInfo(name).then(pkg => {
    res.set(HEADERS);
    res.send(svg(argument(req.query), pkg));
  }).catch(err => {
    res.status(500).send(err.message);
  });
});