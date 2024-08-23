
const userAgent = new (require('user-agents'))({ deviceCategory: 'desktop' })
const chromium = require('chrome-aws-lambda')
const puppeteerExtra = require('puppeteer-extra')
const pluginStealth = require('puppeteer-extra-plugin-stealth')
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha')


puppeteerExtra.use(pluginStealth())
puppeteerExtra.use(
    RecaptchaPlugin({
        provider: {
            id: '2captcha',
            //token: 'process.env.key2Captcha'
            token: 'process.env.key2Captcha'
        },
        visualFeedback: true // colorize reCAPTCHAs (violet = detected, green = solved)
    })
)


async function scrapeCompanyWebsite(domain) {

    let searchResponse = await searchOnNewBrowser(null, domain)

    console.log("JKM");
}

const newBrowser = async (proxyServer, incognito, headless, noUserAgent) => {
    try {
        const args = [
            ...chromium.args,
            `--disable-gpu`,
            `--media-cache-size=0`,
            `--disk-cache-size=0`
        ]
        if (headless) {
            args.push(`--user-data-dir=/tmp`)
            if (!noUserAgent) args.push(`--user-agent=${userAgent.random().toString()}`)
        }
        //if (proxyServer) args.push(`--proxy-server=${proxyServer}`)
        // Launch browser process
        let browser = await puppeteerExtra.launch({
            args,
            ignoreDefaultArgs: ['--disable-extensions', '--enable-automation'],
            executablePath: '/snap/bin/chromium',
            headless, // make false if wants to open browser
            ignoreHTTPSErrors: true
        })
        if (incognito) browser = await browser.createIncognitoBrowserContext()
        return browser
    } catch (error) {
        logger.error('Error while newBrowser(). Error = ' + error)
        throw error
    }
}

const bypassHairlineFeature = async (page) => {
    try {
        await page.evaluateOnNewDocument(() => {
            // Store the existing descriptor
            const elementDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
            // Redefine the property with a patched descriptor
            Object.defineProperty(HTMLDivElement.prototype, 'offsetHeight', {
                ...elementDescriptor,
                get: function() {
                    if (this.id === 'modernizr') {
                        return 1
                    }
                    return elementDescriptor.get.apply(this)
                }
            })
        })
    } catch (error) {
        logger.error('Error while bypassHairlineFeature(). Error = ' + error)
    }
}


const searchOnNewBrowser = async (proxy, searchUrl) => {
    let browser
    try {
        // Get new browser
        browser = await Promise.race([
            newBrowser(``, false, true),
            new Promise((resolve, reject) => {
                setTimeout(reject, 35000, 'Not able to launch browser')
            })
        ])
        // Select initial page
        const initialPage = await browser.pages()
        // Open new page in browser
        const page = await Promise.race([
            browser.newPage(),
            new Promise((resolve, reject) => {
                setTimeout(reject, 5000, 'Not able to open new page')
            })
        ])
        await Promise.all([
            // Close initial page
            initialPage[0].close(),
            // Disable cache
            page.setCacheEnabled(false),
            // Bypass hairline feature
            bypassHairlineFeature(page),
            // Authenticate proxy server
            // page.authenticate({ username: proxy.username, password: proxy.password })
        ])
        await Promise.race([
            page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 50000 }),
            new Promise((resolve, reject) => {
                setTimeout(reject, 52000, 'Error while redirecting to search url')
            })
        ])
        // Scrape webpage content
        const html = await Promise.race([
            page.evaluate(() => document.body.outerHTML),
            new Promise((resolve, reject) => {
                setTimeout(reject, 3000, 'Error while evaluating page')
            })
        ])
        if (html.includes('Your client does not have permission to get URL')) throw new Error('Request forbidden')
        return { browser, page, html }
    } catch (error) {
        logger.error('Error while searchOnNewBrowser(). Error = ' + error)
        if (browser && browser.process()) browser.process().kill('SIGKILL')
        throw error
    }
};


scrapeCompanyWebsite("https://iconics.com/");