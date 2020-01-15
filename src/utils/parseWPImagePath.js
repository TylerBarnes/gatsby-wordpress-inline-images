// this function removes wordpress iamge sizes from a string
module.exports = function parseWPImagePath(urlpath) {
  const imageSizesPattern = new RegExp("(?:[-_]([0-9]+)x([0-9]+))")
  const sizesMatch = urlpath.match(imageSizesPattern)
  const urlpath_remove_sizes = urlpath.replace(imageSizesPattern, "")

  const result = {
    cleanUrl: urlpath_remove_sizes,
    originalUrl: urlpath
  }

  if (sizesMatch) {
    result.width = Number(sizesMatch[1]),
    result.height = Number(sizesMatch[2])
  }

  return result
}
