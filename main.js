const http = require('http');
const fs = require('fs').promises;
const fsSync = require('fs');
const { program } = require('commander');
const url = require('url');
const fxp = require('fast-xml-parser');

// 1) Командні параметри
program
  .requiredOption('-i, --input <path>', 'Path to input JSON file')
  .requiredOption('-h, --host <host>', 'Host address')
  .requiredOption('-p, --port <port>', 'Port number');

program.parse(process.argv);
const options = program.opts();

const inputPath = options.input;
const host = options.host;
const port = Number(options.port);

// 2) Перевірка, чи існує файл
if (!fsSync.existsSync(inputPath)) {
  console.error('Cannot find input file');
  process.exit(1);
}

// 3) Налаштування XML-конвертера
const j2x = new fxp.j2xParser({
  format: true,
  indentBy: "  "
});

function buildXmlObject(records) {
  return { weather_data: { record: records } };
}

// 4) HTTP сервер
const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = url.parse(req.url, true);
    const q = parsedUrl.query;

    const wantHumidity = q.humidity === 'true' || q.humidity === true;
    const minRainfall = q.min_rainfall ? Number(q.min_rainfall) : null;

    const raw = await fs.readFile(inputPath, 'utf8');
    const data = JSON.parse(raw);

    const filtered = data
      .filter(item => {
        if (minRainfall != null) {
          const rv = Number(item.Rainfall);
          return !Number.isNaN(rv) && rv > minRainfall;
        }
        return true;
      })
      .map(item => {
        const out = {
          rainfall: item.Rainfall ?? '',
          pressure3pm: item.Pressure3pm ?? ''
        };
        if (wantHumidity) {
          out.humidity = item.Humidity3pm ?? '';
        }
        return out;
      });

    const xmlObj = buildXmlObject(filtered);
    const xml = j2x.parse(xmlObj);

    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
    res.end(xml);
  } catch (err) {
    console.error('Error handling request:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

server.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}/ - serving ${inputPath}`);
});

process.on('SIGINT', () => {
  console.log('\\nShutting down server...');
  server.close(() => process.exit(0));
});
