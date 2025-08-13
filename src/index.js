import { Readability } from '@mozilla/readability';
import { parse } from "cookie";

/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

const content_styles = `
<style>
body {
    margin: 0 25%;
    padding: 0;
	color: black;
	font-family: serif;
}

blockquote {
	margin: 0;
	border-left: 4px solid gray;
	padding-top: 1rem;
	padding-bottom: 1rem;
	padding-left: 2rem;
}

code {
	background: rgba(0,0,0,0.05);
	width: 100%;
	padding: 1em;
	border-radius: 5px;
	text-wrap: auto;
}

h1 {
    font-weight: 800;
    font-size: 48px;
}


p {
    font-size: 16px;
}

hr {
    border-top: solid 2px;
	margin: 2rem 0;
	width: 100%;
}

a {
	color: black;
    font-weight: 700;
    text-decoration: underline;
}

code {
	display: flex;
	flex-direction: column;
}
</style>

`;

async function getPage(url) {
	const response = await fetch(url)
	const body = await response.text()
	return body
}

async function sendMail(request) {
	const cookies = parse(request.headers.get("Cookie") || "");
	if (!cookies['oauth-params']) {
		return new Error('Not logged in.');
	}
	const token = JSON.parse(cookies['oauth-params']).access_token

	const data = await request.json()
	const url = `https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=multipart`
	const body = `Content-Type: multipart/mixed; boundary=foo_bar_baz
MIME-Version: 1.0
To: ${data.kindle_email}
subject: Kindle Mail

--foo_bar_baz
Content-Type: text/html; charset="UTF-8"
MIME-Version: 1.0

<p>Document Attached Below.</p>

--foo_bar_baz
Content-Type: text/html
MIME-Version: 1.0
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="${data.filename}.html"

${btoa((content_styles + data.content).replace(/[^\x20-\x7E]/g, ""))}

--foo_bar_baz--
`

	// required data keys: content, kindle_email & filename
	try {
		if (cookies['oauth-params']) {
			console.log("sending mail... length", body.length)
			const response = await fetch(url, {
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
	async fetch(request) {
		const url = new URL(request.url);
		const cookies = parse(request.headers.get("Cookie") || "");
		switch (url.pathname) {
			case '/loginstatus':
				if (cookies['oauth-params']) {
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
				const err = await sendMail(request);
				if (err != null) {
					return new Response(err.message)
				}
				return new Response('ok')
			case '/url':
				const usearch = (new URLSearchParams((new URL(request.url)).search)).get('url')
				return new Response(await getPage(usearch))
			default:
				return new Response('Not Found', { status: 404 });
		}
	},
};
