import 'dotenv/config';
import queryString from 'query-string';
import httpStatus from 'http-status';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';
dayjs.extend(relativeTime);
import https from 'https';
import zlib from 'zlib';
import http from 'http';
import url from 'url';
import fs from 'fs';

const E = process.env;
const CARD = fs.readFileSync('card.svg', 'utf8');
const LOGO = fs.readFileSync('logo.svg', 'utf8');
const HEADERS = {
  'Content-Type': 'image/svg+xml',
  'Access-Control-Allow-Origin': `${E.DOMAIN || 'http://localhost'}`,
  'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept'
};




/**
 * 发送 HTTP 请求
 * @param {string} pth - 请求路径
 * @param {string} [method='GET'] - HTTP 方法
 * @returns {Promise} 返回包含响应数据的 Promise
 */
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


/**
 * 解析查询参数
 * @param {object} qry - 查询参数对象
 * @returns {object} 包含 width, height, margin 的对象
 */
function argument(qry) {
  const width  = parseFloat(qry.width)  || 384;
  const height = parseFloat(qry.height) || 56;
  const margin = parseFloat(qry.margin) || 4;
  return {width, height, margin};
}


/**
 * 获取包信息
 * @param {string} name - 包名称
 * @returns {Promise} 返回包含包信息的 Promise
 */
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
    return {install: name, dependencies: '?', license: '?', version: '?', updated: '?'};});
}


/**
 * 计算 SVG 宽度
 * @param {number} org - 原始宽度
 * @param {string} ins - 安装命令
 * @param {string} upd - 更新时间
 * @returns {number} 计算后的宽度
 */
function fitWidth(org, ins, upd) {
  const iw = 110 + (12 + ins.length) * 12 * 0.63;
  const uw = 240 + upd.length        * 11 * 0.63;
  return Math.round(Math.max(org, iw, uw));
}


/**
 * 生成 SVG 内容
 * @param {object} arg - 包含 width, height, margin 的参数对象
 * @param {object} pkg - 包信息对象
 * @returns {string} 生成的 SVG 字符串
 */
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


const server = http.createServer((req, res) => {
  if (req.url==='/') { res.writeHead(302, {'Location': `${E.DOMAIN}`}); return res.end(); }
  const {path, search} = url.parse(req.url.toLowerCase());
  const query = queryString.parse(search);
  if (!path.endsWith('.svg')) return res.end();
  const name = path.substring(1, path.length-4);
  getPackageInfo(name).then(pkg => { 
    res.writeHead(200, HEADERS);
    res.end(svg(argument(query), pkg));
  }, _ => res.end()).catch(err => {
    res.end(err.message);
  });
});
console.log(`Server running at ${E.DOMAIN || 'http://localhost'}:${E.PORT || 80}/`);
server.listen(E.PORT || 80);