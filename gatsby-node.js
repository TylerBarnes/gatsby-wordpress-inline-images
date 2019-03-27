const _ = require("lodash");
const cheerio = require(`cheerio`);
const { createRemoteFileNode } = require(`gatsby-source-filesystem`);
const { fluid } = require(`gatsby-plugin-sharp`);

const removeImageSizes = require("./utils/removeImageSizes");

const {
  imageClass,
  imageBackgroundClass,
  imageWrapperClass
} = require(`./constants`);

exports.sourceNodes = async (
  { getNodes, cache, reporter, store, actions, createNodeId },
  pluginOptions
) => {
  const { createNode } = actions;

  const defaults = {
    maxWidth: 650,
    wrapperStyle: ``,
    backgroundColor: `white`,
    postTypes: [
      'post',
      'page'
    ]
    // linkImagesToOriginal: true,
    // showCaptions: false,
    // pathPrefix,
    // withWebp: false
  };

  const options = _.defaults(pluginOptions, defaults);

  const nodes = getNodes();

  // for now just get all posts and pages.
  // this will be dynamic later
  const entities = nodes.filter(
    node =>
      node.internal.owner === "gatsby-source-wordpress" &&
      options.postTypes.includes(node.type)
  );

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
          createNodeId
        },
        options
      )
    )
  );
};

const transformInlineImagestoStaticImages = async (
  { entity, cache, reporter, store, createNode, createNodeId },
  options
) => {
  const field = entity.content;

  if ((!field && typeof field !== "string") || !field.includes("<img")) return;

  const $ = cheerio.load(field);

  const imgs = $(`img`);

  if (imgs.length === 0) return;

  let imageRefs = [];

  imgs.each(function() {
    imageRefs.push($(this));
  });

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
        createNodeId
      })
    )
  );

  entity.content = $.html();
};

const replaceImage = async ({
  thisImg,
  options,
  cache,
  store,
  createNode,
  createNodeId,
  reporter,
  $
}) => {
  // find the full size image that matches, throw away WP resizes
  const url = removeImageSizes(thisImg.attr("src"));

  const imageNode = await downloadMediaFile({
    url,
    cache,
    store,
    createNode,
    createNodeId
  });

  if (!imageNode) return;

  let classes = thisImg.attr("class");
  let formattedImgTag = {};
  formattedImgTag.url = thisImg.attr(`src`);
  formattedImgTag.classList = classes ? classes.split(" ") : [];
  formattedImgTag.title = thisImg.attr(`title`);
  formattedImgTag.alt = thisImg.attr(`alt`);

  if (!formattedImgTag.url) return;

  const fileType = imageNode.ext;

  // Ignore gifs as we can't process them,
  // svgs as they are already responsive by definition
  if (fileType !== `gif` && fileType !== `svg`) {
    const rawHTML = await generateImagesAndUpdateNode({
      formattedImgTag,
      imageNode,
      options,
      cache,
      reporter,
      $
    });

    // Replace the image string
    if (rawHTML) thisImg.replaceWith(rawHTML);
  }
};

// Takes a node and generates the needed images and then returns
// the needed HTML replacement for the image
const generateImagesAndUpdateNode = async function({
  formattedImgTag,
  imageNode,
  options,
  cache,
  reporter,
  $
}) {
  if (!imageNode || !imageNode.absolutePath) return;

  let fluidResult = await fluid({
    file: imageNode,
    args: options,
    reporter,
    cache
  });

  if (!fluidResult) return;

  const fallbackSrc = fluidResult.src;
  const srcSet = fluidResult.srcSet;
  const presentationWidth = fluidResult.presentationWidth;
  const fullsizeImgLink = fluidResult.originalImg;

  // replace WP image links
  $(`a`).each(function() {
    if (
      removeImageSizes($(this).attr("href")) ===
      removeImageSizes(formattedImgTag.url)
    ) {
      $(this).attr("href", fullsizeImgLink);
    }
  });

  // Generate default alt tag
  const srcSplit = fluidResult.src.split(`/`);
  const fileName = srcSplit[srcSplit.length - 1];
  const fileNameNoExt = fileName.replace(/\.[^/.]+$/, ``);
  const defaultAlt = fileNameNoExt.replace(/[^A-Z0-9]/gi, ` `);

  const imageStyle = `
      width: 100%;
      height: 100%;
      margin: 0;
      vertical-align: middle;
      position: absolute;
      top: 0;
      left: 0;
      box-shadow: inset 0px 0px 0px 400px ${options.backgroundColor};`.replace(
    /\s*(\S+:)\s*/g,
    `$1`
  );

  // Create our base image tag
  let imageTag = `
      <img
        class="${imageClass} ${formattedImgTag.classList.join(" ")}"
        style="${imageStyle}"
        alt="${formattedImgTag.alt ? formattedImgTag.alt : defaultAlt}"
        title="${formattedImgTag.title ? formattedImgTag.title : ``}"
        src="${fallbackSrc}"
        srcset="${srcSet}"
        sizes="${fluidResult.sizes}"
      />
    `.trim();

  // // if options.withWebp is enabled, generate a webp version and change the image tag to a picture tag
  // if (options.withWebp) {
  //   const webpFluidResult = await fluid({
  //     file: imageNode,
  //     args: _.defaults(
  //       { toFormat: `WEBP` },
  //       // override options if it's an object, otherwise just pass through defaults
  //       options.withWebp === true ? {} : options.withWebp,
  //       pluginOptions,
  //       defaults
  //     ),
  //     reporter,
  //   })

  //   if (!webpFluidResult) {
  //     return false;
  //   }

  //   imageTag = `
  //   <picture>
  //     <source
  //       srcset="${webpFluidResult.srcSet}"
  //       sizes="${webpFluidResult.sizes}"
  //       type="${webpFluidResult.srcSetType}"
  //     />
  //     <source
  //       srcset="${srcSet}"
  //       sizes="${fluidResult.sizes}"
  //       type="${fluidResult.srcSetType}"
  //     />
  //     <img
  //       class="${imageClass}"
  //       style="${imageStyle}"
  //       src="${fallbackSrc}"
  //       alt="${node.alt ? node.alt : defaultAlt}"
  //       title="${node.title ? node.title : ``}"
  //     />
  //   </picture>
  //   `.trim()
  // }

  const ratio = `${(1 / fluidResult.aspectRatio) * 100}%`;

  // Construct new image node w/ aspect ratio placeholder
  // const showCaptions = options.showCaptions && node.title
  const showCaptions = false;

  let rawHTML = `
  <span
    class="${imageWrapperClass}"
    style="position: relative; display: block; ${
      showCaptions ? `` : options.wrapperStyle
    } max-width: ${presentationWidth}px; margin-left: auto; margin-right: auto;"
  >
    <span
      class="${imageBackgroundClass}"
      style="padding-bottom: ${ratio}; position: relative; bottom: 0; left: 0; background-image: url('${
    fluidResult.base64
  }'); background-size: cover; display: block;"
    ></span>
    ${imageTag}
  </span>
  `.trim();

  //   // Make linking to original image optional.
  //   if (!inLink && options.linkImagesToOriginal) {
  //     rawHTML = `
  // <a
  //   class="gatsby-resp-image-link"
  //   href="${originalImg}"
  //   style="display: block"
  //   target="_blank"
  //   rel="noopener"
  // >
  //   ${rawHTML}
  // </a>
  //   `.trim()
  //   }

  //   // Wrap in figure and use title as caption
  //   if (showCaptions) {
  //     rawHTML = `
  // <figure class="gatsby-resp-image-figure" style="${options.wrapperStyle}">
  //   ${rawHTML}
  //   <figcaption class="gatsby-resp-image-figcaption">${node.title}</figcaption>
  // </figure>
  //     `.trim()
  //   }
  return rawHTML;
};

const downloadMediaFile = async ({
  url,
  cache,
  store,
  createNode,
  createNodeId
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
  let fileNode = false;
  try {
    fileNode = await createRemoteFileNode({
      url,
      store,
      cache,
      createNode,
      createNodeId
    });
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

  return fileNode;
  // if (fileNodeID) {
  //   e.localFile___NODE = fileNodeID
  //   delete e.media_details.sizes
  // }

  // return e
};
