const TikTokScraper = require('tiktok-scraper');

// usefullink 
// scrate trending videos of tiktok
// (async () => {
//     try {
//         const posts = await TikTokScraper.trend('', { number: 100, filetype:'csv'});
//         // console.log(posts);
//     } catch (error) {
//         console.log(error);
//     }
// })();

// scrape search results of you tube
// // useful link   : https://github.com/DrKain/scrape-youtube
const youtube = require('scrape-youtube').default;

youtube.searchOne('Short Change Hero').then(video => {
    console.log(JSON.stringify(video, null, 2));
}).catch(console.error);;
