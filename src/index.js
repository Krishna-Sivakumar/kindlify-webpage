import { Readability } from '@mozilla/readability';
import { parse } from "cookie";
import getMime from "./mimes"
import mustache from "mustache";
import JSZip from "jszip"

/*
 * Sends a mail through the GMail API.
 * Takes a request and an env object for context.
 * The request must contain the data for the mail in JSON format.
 */
async function sendMail(request, env) {
	const getAsset = (url, request, env) => {
		return env.assets.fetch(new URL(request.url).origin + '/' + url)
				.then(response => response.text())
	}

	// Schema:
	// filename: 	string
	// content:		string
	// img_sources:	string[]
	const data = await request.json()

	// fetching static assets
	const styling = await getAsset('preview.css', request, env)
	const mailText = await getAsset('mail.template', request, env);
	const containerxml = await getAsset('container.xml.template', request, env)
	const metaopf = await getAsset('meta.opf.template', request, env)
	const pagexhtml = await getAsset('page.template', request, env)
	const tocncx = await getAsset('toc.ncx.template', request, env)

	// EPUB file structure:
	// .
	// ├── mimetype
	// ├── toc.ncx
	// ├── META-INF/
	// │   └── container.xml
	// ├── index.html
	// ├── styles.css
	// ├── meta.opf
	// └── images/
	//		├── *.png
	//		├── *.jpg
	//		└── *.webp

	const uuid = crypto.randomUUID();
	let zip = new JSZip();

	zip.file("mimetype", "application/epub+zip")
	zip.file("toc.ncx", mustache.render(tocncx, {
		uuid: uuid,
		title: data.filename,
	}))
	const meta = zip.folder("META-INF")
	meta.file("container.xml", mustache.render(containerxml, {}))

	zip.file("index.html", mustache.render(pagexhtml, {
		title: data.filename,
		styling: styling,
		content: data.content,
	}).replaceAll("&nbsp;", "&#160;"))
	zip.file("styles.css", styling)
	zip.file("meta.opf", mustache.render(metaopf, {
		uuid: uuid,
		title: data.filename,
		date: new Date().toISOString(),
		images: data.img_sources.map((src, idx) => ({
			src: new URL(src).pathname.split('/').at(-1),
			id: `id${idx+1}`,
			mime: getMime(new URL(src).pathname.split('/').at(-1))
		})),
	}))
	const images = zip.folder("images")
	for (let i = 0; i < data.img_sources.length; i ++) {
		const src = data.img_sources[i];
		const image = await fetch(src)
		const url = new URL(src)
		const binary = await image.bytes()
		images.file(url.pathname.split('/').at(-1), binary)
	}

	// generate the zip file
	const zipContent = await zip.generateAsync({type: "base64", mimeType: "application/epub+zip"})
	data.zipContent = zipContent

	// generate email body
	const body = mustache.render(mailText, data)


	// get oauth
	const cookies = parse(request.headers.get("Cookie") || "");
	if (!cookies['oauth-params']) {
		return new Error('Not logged in.');
	}
	const token = JSON.parse(cookies['oauth-params']).access_token
	const gapiMailEndpoint = `https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=multipart`

	// invoke GMail API to send the generated email
	// required data keys: content, kindle_email & filename
	try {
		if (cookies['oauth-params']) {
			console.log("sending mail... length", body.length)
			const response = await fetch(gapiMailEndpoint, {
				method: "POST",
				headers: {
					'Content-Type': 'message/rfc822',
					'Authorization': `Bearer ${token}`,
				},
				body: body
			});
			const responseJson = await response.json()
			if (responseJson.error) {
				return new Error(responseJson.error.message)
			}
		}
		return null
	} catch (e) {
		return e;
	}
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const cookies = parse(request.headers.get("Cookie") || "");

		switch (url.pathname) {
			case '/loginstatus':
				if (cookies['oauth-params']) {
					// check if oauth token is valid, if it is present
					const oauth = JSON.parse(cookies['oauth-params'])
					const currentSeconds = Math.floor(Date.now() / 1000);
					if (oauth.iat + oauth.expires_in > currentSeconds) {
						return new Response('ok')
					}
				}
				return new Response('nok')

			case '/setcookie':
				const body = await request.text()
				let headers = new Headers()
				headers.append("Set-Cookie", `oauth-params=${body}; Path=/; HttpOnly; SameSite=Strict; Secure;`)
				return new Response('ok', { headers: headers} );

			case '/upload':
				const err = await sendMail(request, env);
				if (err != null) {
					return new Response(err.message)
				}
				return new Response('ok')

			case '/url':
				const usearch = (new URLSearchParams((new URL(request.url)).search)).get('url')
				return new Response(await fetch(usearch).then(response => response.text()))

			default:
				return new Response('Not Found', { status: 404 });
		}
	},
};
