1. Code (tag) formatting doesn't work on kindle. Fix this
	* Solution:
		* search for all `<pre>` tags
		* split the textcontent by newlines
		* trim the indent spacing and replace them with `&nbsp;`
		* insert the new div tag before the existing pre tag
		* remove the pre tag
		* the div and paragraph need per-line styling.
2. Images don't work _at all_. Fix this, please!
	* The page needs to be compiled into a zip file
	* each image needs to be within root
	* each src link should have no dir path

5. Make sure error messages are communicated to the user properly (Especially 'invalid to header' and stuff like that)
