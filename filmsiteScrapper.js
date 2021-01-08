const request = require('request');
const cheerio = require('cheerio');
const ObjectsToCsv = require('objects-to-csv')
const async = require('async');

const neatCsv = require('neat-csv');
const fs = require('fs')

// Global variables
var baseDomain = "https://www.filmsite.org/";

var decadeUrls = [];
var result = []
// selector for urls = #mainBodyWrapper > center:nth-child(3) > font:nth-child(5) > a:nth-child(1)

function getDecadeUrls(url,cb) {
    request(url, async (error, response, html) => {
        try {
            const $ = cheerio.load(html);
            let element = $('#mainBodyWrapper > center:nth-child(3) > font:nth-child(5) > ');
            let length = element.length;
            // console.log(element, length);
            for (let i = 0; i < length;i++) {
                // console.log('element is ', element[i].attribs.href);
                decadeUrls.push(baseDomain + element[i].attribs.href)
            }
            console.log(decadeUrls);
            cb(null,decadeUrls)
        }
        catch (err) {
            console.log('err is ', err)
            cb(err)
        }
    });
}

//selector = #mainBodyWrapper > table > tbody > tr:nth-child(2) > td:nth-child(1)
// #mainBodyWrapper > table > tbody > tr:nth-child(2) > td:nth-child(1) > p:nth-child(1)
// #mainBodyWrapper > table > tbody > tr:nth-child(2) > td:nth-child(1) > p:nth-child(1)
function fetchData(url,cb) {
    request(url, async (error, response, html) => {
        try {
            const $ = cheerio.load(html);
            let td1 = $('table > tbody > tr:nth-child(2) > td:nth-child(1)');
            let ps = td1.find('p')
            // console.log(ps.length,  ps[0])
            generateData($,ps, result);
           
            let td2 = $('table > tbody > tr:nth-child(2) > td:nth-child(2)');
            let ps2 = td2.find('p')
            generateData($, ps2, result);
            cb()
            
        }
        catch (err) {
            console.log(err)
            cb()
        }
    })
}

function generateData($, ps, r) {
    let obj ={}
    ps.each((i, ele) => {
        // console.log('i and ele are ', i, $(ele).find('a').last().attr('href'),$(ele).find('em').text() , $(ele).find('strong').text());
        // console.log('data is ', i, $(ele).find('em').text())
        obj.movie = $(ele).find('em').text().split('(')[0].replace(/\s+/g, " ");
        obj.movieYear = $(ele).find('em').text().match(/[0-9]{4}/g)? $(ele).find('em').text().match(/[0-9]{4}/g)[0]: 0;
        obj.url = baseDomain + $(ele).find('a').last().attr('href');
        obj.dialogue = $(ele).text().replace(/\s+/g, " ");
        obj.dialogue = obj.dialogue.replace(/[pP][lL][a-zA-Z \(]*\):/g, '');
        if (obj.movie == "") {
            obj.movie = obj.dialogue.split('"').pop();
            obj.movieYear = obj.movie.match(/[0-9]{4}/g) ? obj.movie.match(/[0-9]{4}/g)[0] : 0;
        }
        obj.dialogue = obj.dialogue.replace(obj.movie, '');
        obj.dialogue = obj.dialogue.replace(/\([0-9]{4}\)/g, '')
        console.log('obj is ', obj)
        r.push(obj)
    })
    return;
}

async function write2file(fileName, obj) {
    const csv = new ObjectsToCsv(obj) 
    await csv.toDisk(fileName, { append: true, allColumns: false })
    return;
}

function parseElement(element, result) {
    console.log(element.text().split('\n')[2], element.text().split('\n')[3], element.text().split('\n')[4])
    let textArray = element.text().split('\n');
    let obj = {}
    for (let i of textArray) {               
        if (i.match(/[0-9]{4}/g)) {
            obj.movieYear = i.match(/[0-9]{4}/g)[0];
            obj.movie = i.split('(')[0].replace(/\s+/g, " ");
            obj.dialogue = obj.dialogue.replace(/\s+/g, " ");
            result.push(obj);
            obj = {};
        } else {
            console.log(obj);
            i = i.replace(/[pP][lL][a-zA-Z \(]*\):/g,'')
            obj.dialogue = obj.dialogue ? obj.dialogue + i : i;
        }
    }
}
(function () {
    // fetchData('https://www.filmsite.org/moments00.html');

    async.waterfall([
        (next) => {
            getDecadeUrls('https://www.filmsite.org/moments00.html', (err, data) => {
                next(err,data)
            })
        },
        (next) => {
            async.eachLimit(decadeUrls,1, (url,cb) => {
                fetchData(url, () => {
                    cb()
                })
            },
                () => {
                //write to csv file
                setTimeout(() => {
                    write2file("./filmsiteData.csv", result);
                }, 1000)
            })
        }
    ],
        (err) => {
            process.exit();
    })
})()
