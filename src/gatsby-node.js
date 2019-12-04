const _ = require(`lodash`)
const React = require(`react`)
const ReactDOMServer = require(`react-dom/server`)
const cheerio = require(`cheerio`)
const { createRemoteFileNode } = require(`gatsby-source-filesystem`)
const { fluid } = require(`gatsby-plugin-sharp`)
const Img = require(`gatsby-image`)

const parseWPImagePath = require(`./utils/parseWPImagePath`)

exports.sourceNodes = async (
	{ getNodes, cache, reporter, store, actions, createNodeId },
	pluginOptions,
) => {
	const { createNode } = actions

	const defaults = {
		maxWidth: 650,
		wrapperStyle: ``,
		backgroundColor: `white`,
		postTypes: ["post", "page"],
		withWebp: false,
		// linkImagesToOriginal: true,
		// showCaptions: false,
		// pathPrefix,
		// withWebp: false
	}

	const options = _.defaults(pluginOptions, defaults)

	const nodes = getNodes()

	// for now just get all posts and pages.
	// this will be dynamic later
	const entities = nodes.filter(
		node =>
			node.internal.owner === "gatsby-source-wordpress" &&
			options.postTypes.includes(node.type),
	)

	// we need to await transforming all the entities since we may need to get images remotely and generating fluid image data is async
	await Promise.all(
		entities.map(async entity =>
			transformInlineImagestoStaticImages(
				{
					entity,
					cache,
					reporter,
					store,
					createNode,
					createNodeId,
				},
				options,
			),
		),
	)
}

const transformInlineImagestoStaticImages = async (
	{ entity, cache, reporter, store, createNode, createNodeId },
	options,
) => {
	const field = entity.content

	if ((!field && typeof field !== "string") || !field.includes("<img")) return

	const $ = cheerio.load(field)

	const imgs = $(`img`)

	if (imgs.length === 0) return

	let imageRefs = []

	imgs.each(function() {
		imageRefs.push($(this))
	})

	await Promise.all(
		imageRefs.map(thisImg =>
			replaceImage({
				thisImg,
				options,
				cache,
				reporter,
				$,
				store,
				createNode,
				createNodeId,
			}),
		),
	)

	entity.content = $.html()
}

const replaceImage = async ({
	thisImg,
	options,
	cache,
	store,
	createNode,
	createNodeId,
	reporter,
	$,
}) => {
	// find the full size image that matches, throw away WP resizes
	const parsedUrlData = parseWPImagePath(thisImg.attr("src"))
	const url = parsedUrlData.cleanUrl

	const imageNode = await downloadMediaFile({
		url,
		cache,
		store,
		createNode,
		createNodeId,
	})

	if (!imageNode) return

	let classes = thisImg.attr("class")
	let formattedImgTag = {}
	formattedImgTag.url = thisImg.attr(`src`)
	formattedImgTag.classList = classes ? classes.split(" ") : []
	formattedImgTag.title = thisImg.attr(`title`)
	formattedImgTag.alt = thisImg.attr(`alt`)

	if (parsedUrlData.width) formattedImgTag.width = parsedUrlData.width
	if (parsedUrlData.height) formattedImgTag.height = parsedUrlData.height

	if (!formattedImgTag.url) return

	const fileType = imageNode.ext

	// Ignore gifs as we can't process them,
	// svgs as they are already responsive by definition
	if (fileType !== `gif` && fileType !== `svg`) {
		const rawHTML = await generateImagesAndUpdateNode({
			formattedImgTag,
			imageNode,
			options,
			cache,
			reporter,
			$,
		})

		// Replace the image string
		if (rawHTML) thisImg.replaceWith(rawHTML)
	}
}

// Takes a node and generates the needed images and then returns
// the needed HTML replacement for the image
const generateImagesAndUpdateNode = async function({
	formattedImgTag,
	imageNode,
	options,
	cache,
	reporter,
	$,
}) {
	if (!imageNode || !imageNode.absolutePath) return

	let fluidResultWebp
	let fluidResult = await fluid({
		file: imageNode,
		args: {
			...options,
			maxWidth: formattedImgTag.width || options.maxWidth,
		},
		reporter,
		cache,
	})

	if (options.withWebp) {
		fluidResultWebp = await fluid({
			file: imageNode,
			args: {
				...options,
				maxWidth: formattedImgTag.width || options.maxWidth,
				toFormat: "WEBP",
			},
			reporter,
			cache,
		})
	}

	if (!fluidResult) return

	if (options.withWebp) {
		fluidResult.srcSetWebp = fluidResultWebp.srcSet
	}

	const imgOptions = {
		fluid: fluidResult,
		style: {
			maxWidth: "100%",
		},
		// Force show full image instantly
		critical: true,
		alt: formattedImgTag.alt,
		// fadeIn: true,
		imgStyle: {
			opacity: 1,
		},
	}
	if (formattedImgTag.width) imgOptions.style.width = formattedImgTag.width

	const ReactImgEl = React.createElement(Img.default, imgOptions, null)
	return ReactDOMServer.renderToString(ReactImgEl)
}

const downloadMediaFile = async ({
	url,
	cache,
	store,
	createNode,
	createNodeId,
}) => {
	// const mediaDataCacheKey = `wordpress-media-${e.wordpress_id}`
	// const cacheMediaData = await cache.get(mediaDataCacheKey)
	// // If we have cached media data and it wasn't modified, reuse
	// // previously created file node to not try to redownload
	// if (cacheMediaData && e.modified === cacheMediaData.modified) {
	//   fileNodeID = cacheMediaData.fileNodeID
	//   touchNode({ nodeId: cacheMediaData.fileNodeID })
	// }

	// If we don't have cached data, download the file
	// if (!fileNodeID) {
	let fileNode = false
	try {
		fileNode = await createRemoteFileNode({
			url,
			store,
			cache,
			createNode,
			createNodeId,
		})
		// auth: _auth,
		// if (fileNode) {
		//   fileNodeID = fileNode.id
		//   // await cache.set(mediaDataCacheKey, {
		//   //   fileNodeID,
		//   //   modified: e.modified,
		//   // })
		// }
	} catch (e) {
		// Ignore
	}
	// }

	return fileNode
	// if (fileNodeID) {
	//   e.localFile___NODE = fileNodeID
	//   delete e.media_details.sizes
	// }

	// return e
}
