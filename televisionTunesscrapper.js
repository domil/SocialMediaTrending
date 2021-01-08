const request = require('request');
const cheerio = require('cheerio');
const ObjectsToCsv = require('objects-to-csv')
const async = require('async');

const neatCsv = require('neat-csv');
const fs = require('fs')

// Global variables
var baseDomain = "http://www.televisiontunes.com";

var az = [];
let pageUrls = [];
var result = []

function getAZUrls(url,cb) {
    try {
        request(url, (err, body, html) => {
            let $ = cheerio.load(html);
            let elements = $('.btn.btn_orange.btn-category');
            elements.each((i, ele) => {
                if (i < 27) {
                    az.push(baseDomain + $(ele).attr('value'));
                }
            })
            console.log(az);
            cb()
        })
    }
    catch (err) {
        console.log(err);
        cb();
    }
}

function getUrlForAlphabet(url,cb) {
    try {
        request(url, (err, body, html) => {
            let $ = cheerio.load(html);
            let elements = $('a.jp-play');
            // console.log(elements);
            elements.each((i, ele) => {
                // console.log(i, $(ele).attr('href'));
                pageUrls.push(baseDomain + $(ele).attr('href'))
            })
            console.log(pageUrls);
            cb();
        })
    }
    catch (err) {
        console.log(err);
        cb()
    }
}

function getLevel3Urls(url,cb){
    try {
        request(url, (err, body, html) => {
            let $ = cheerio.load(html);
            let element = $('#download_song')
            // console.log(element)
            result.push({"link":baseDomain + element.attr('href'), "song":element.text().replace(/[dD]ownload/g,'')})
            console.log(result.length);
            cb();
        })
       
    }
    catch (err) {
        console.log(err);
        cb();
    }
}

async function write2file(fileName, obj) {
    const csv = new ObjectsToCsv(obj) 
    await csv.toDisk(fileName, { append: true, allColumns: false })
    return;
}


(function () {
    // getAZUrls(baseDomain,()=>{})
    let url = "http://www.televisiontunes.com/a-theme-songs.html"
    // getUrlForAlphabet(url,()=>{})
    let level3url = 'http://www.televisiontunes.com/ABC___ALCS_Game_5___Royals_vs_Yankees.html';
    // getLevel3Urls(level3url,()=>{})
    async.waterfall([
        (next) => {
            getUrlForAlphabet('http://www.televisiontunes.com/a-theme-songs.html', (err, data) => {
                next(err,data)
            })
        },
        (next) => {
            async.eachLimit(pageUrls,5, (url,cb) => {
                getLevel3Urls(url, () => {
                    cb()
                })
            },
                () => {
                //write to csv file
                setTimeout(() => {
                    write2file("./televisionTunes.csv", result);
                }, 1000)
            })
        }
    ],
        (err) => {
            process.exit();
    })
})()

