const request = require('request');
const cheerio = require('cheerio');
const ObjectsToCsv = require('objects-to-csv')
const a = require('async');

const neatCsv = require('neat-csv');
const fs = require('fs')

// Global variables
var baseDomain = "https://www.filmyquotes.com";

var moviesData = [];


async function readCsv(fileName) {
    return new Promise((resolve, reject) => {
        fs.readFile(fileName, async (err, data) => {
            if (err) {
              console.error(err)
              return
            }
            let finalData = await neatCsv(data);
            console.log(finalData.length)
            resolve(finalData);
          }) 
    })
}

// url = https://www.filmyquotes.com/movies/1870
async function parseMoviePage(url) {
    // return new Promise((resolve, reject) => {
    request(url, async (error, response, html) => {
        try {
            const $ = cheerio.load(html);
            let result = [];
            let length = $('h5.card-title').length;
            let movie = $('h4.card-title')[0].children[0].data;
            let year = $('small')[0].children[0].data;
            let actor = $('span.badge.badge-primary.ml-2');
            // console.log(actor[0].children[0].data)
            console.log(movie, year);
            for (let i = 0; i < length; i++) {
                result.push({ year: year.match(/(\d+)/)[0], movie: movie, actor: actor[i].children[0].data, dialogue: $('h5.card-title')[i].children[0].data, englishDialogue: $('div.card-title')[i].children[0].data });
            }
            moviesData.push(result);
            // console.log(result);
            write2file("./filmQuotes2.csv", result);
            //     .then(() => {
            //     resolve()
            // })
            // resolve()
            setTimeout(() => {
                return;
            }, 100);
        }
        catch (err) {
            console.log('hey error is coming ', err)
            parseMoviePage(url);
        }
        });


    // })
}

async function parseMovieYear(url) {
    let urls = [];
    request(url, async (error, response, html) => {
        const $ = cheerio.load(html);
        let moviesUrl = $('a.list-group-item.list-group-item-action.flex-column.align-items-start');
        console.log(moviesUrl.length, moviesUrl[0].children[0].parent.attribs.href);
        for (let i = 0; i < moviesUrl.length; i++){
            console.log(moviesUrl[i].children[0].parent.attribs.href)
            let movieUrl = moviesUrl[i].children[0].parent.attribs.href;
            urls.push(baseDomain + movieUrl);
        }

        // save  to movie Urls csv file
        // urls = urls.map(url => { return { moviePageUrl: url} })
        // write2file("./movieUrlsDuplicate.csv", urls);

        // final step parse each movie page and save results
        urls.map(moviePageUrl => parseMoviePage(moviePageUrl))

        return; 
    })
}

async function write2file(fileName, obj) {
    const csv = new ObjectsToCsv(obj) 
    await csv.toDisk(fileName, { append: true, allColumns: false })
    return;
}

async function parseMainPage(url) {
    request(url, (error, response, html) => {
        const $ = cheerio.load(html);
        let page = $('a.list-group-item.list-group-item-info.flex-column.align-items-start')
        let urls = []
        // page[0].children[0].parent.attribs.href
        console.log('length is ', page.length)
        for (let i = 0; i < page.length; i++){
            // console.log(page[i].children[0].parent.attribs.href)
            let yearUrl = page[i].children[0].parent.attribs.href;
            urls.push(baseDomain + yearUrl);
        }  

        // start parsing all movie pages by year 
        // sample url = https://www.filmyquotes.com/movies/list/2020
        urls.map(yearUrl => {
            parseMovieYear(yearUrl);
        })
        
    })
}

async function processCsv() {
    readCsv("./movieUrlsDuplicate.csv")
        .then((data) => {
            // console.log(data)
            a.each(data, (movie) => {
                parseMoviePage(movie['moviePageUrl'])
            })

            setTimeout(() => {
                write2file("./moviesData.csv", moviesData);
            }, 120000)

    })
    
}

(async ()=>{
    // parseMainPage('https://www.filmyquotes.com/movies/')
    // parseMovieYear("https://www.filmyquotes.com/movies/list/2020");
    // parseMoviePage("https://www.filmyquotes.com/movies/1870")
    processCsv()
})()

