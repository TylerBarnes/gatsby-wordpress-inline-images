__NOTE__: I've joined the Gatsby core team to work on the future of `gatsby-source-wordpress` with WPGraphQL. For that reason I will be deprioritizing working on it and will soon deprecate it. If you need this package and are interested in maintaining it please ask me about it!

# Gatsby WordPress inline images

`gatsby-source-wordpress` doesn't process images in blocks of text which means your admin site has to serve the images. This plugin solves that.

Require `gatsby-source-wordpress` and `gatsby-image` to be preinstalled

This is a WIP and little testing has been done. I modified this code from my alternative WP source plugin [`wordsby`](https://github.com/TylerBarnes/wordsby) which was originally modified from [`gatsby-remark-images`](https://www.gatsbyjs.org/packages/gatsby-remark-images/). Currently this plugin isn't doing any caching of images. This plugin is also currently hardcoded to only work on pages and posts and only on the post content field. Other post types and fields will be supported later.
There is a bunch of commented out code that needs to be sorted through. If you need this plugin please help out by sending PR's!

## installation

```bash
yarn add gatsby-wordpress-inline-images
```

Add this plugin as a plugin of `gatsby-source-wordpress`.
Be sure to specify your baseurl and protocol a second time in the `gatsby-wordpress-inline-images` options, not just in the `gatsby-source-wordpress` options.

```javascript
  {
    resolve: `gatsby-source-wordpress`,
    options: {
      baseUrl: `your-site.com`
      protocol: `https`,
      plugins: [
          {
            resolve: `gatsby-wordpress-inline-images`,
            options: {
              baseUrl: `your-site.com`,
              protocol: `https`
            }
          }
        ]
      }
  }
```

## Options

```javascript
{
	resolve: `gatsby-source-wordpress`,
	options: {
		// required
		baseUrl: `your-site.com`,
		protocol: `https`,
		// defaults
		maxWidth: 650,
		wrapperStyle: ``,
		postTypes: ["post", "page"],
		backgroundColor: `white`,
		withWebp: false, // enable WebP files generation
		useACF: false, // process <img> tags in ACF fields too
		// add any image sharp fluid options here
		// ...
	}
}
```
