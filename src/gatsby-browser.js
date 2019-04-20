const {
  imageSelector,
  imageBackgroundSelector,
  imageWrapperSelector
} = require(`./constants`)

exports.onRouteUpdate = () => {
  const imageWrappers = document.querySelectorAll(imageWrapperSelector)

  // https://css-tricks.com/snippets/javascript/loop-queryselectorall-matches/
  // for cross-browser looping through NodeList without polyfills
  for (let i = 0; i < imageWrappers.length; i++) {
    const imageWrapper = imageWrappers[i]

    const backgroundElement = imageWrapper.querySelector(
      imageBackgroundSelector
    )
    const imageElement = imageWrapper.querySelector(imageSelector)

    if (
      !"IntersectionObserver" in window &&
      !"IntersectionObserverEntry" in window &&
      !"intersectionRatio" in window.IntersectionObserverEntry.prototype
    ) {
      return observerFallback({ backgroundElement, imageElement })
    }

    const observer = new IntersectionObserver(function(entries) {
      const [entry] = entries

      // If intersectionRatio is 0, the target is out of view
      // and we do not need to do anything.
      if (entry.intersectionRatio <= 0) return

      const element = entry.target

      const src = element.getAttribute("data-src")
      const srcSet = element.getAttribute("data-srcSet")
      const sizes = element.getAttribute("data-sizes")

      element.setAttribute(`src`, src)
      element.setAttribute(`srcSet`, srcSet)
      element.setAttribute(`sizes`, sizes)

      element.removeAttribute(`data-src`)
      element.removeAttribute(`data-srcSet`)
      element.removeAttribute(`data-sizes`)

      element.style.opacity = 1

      const wrapper = element
        .closest(`.gatsby-image-wrapper`)
      
      if (wrapper) {
        const lqip = wrapper.querySelector(`.gatsby-wordpress-inline-images--lqip`)

        lqip.style.opacity = 0
      }

      observer.unobserve(element)
    })

    observer.observe(imageElement)
  }
}

function observerFallback({ backgroundElement, imageElement }) {
  const onImageLoad = () => {
    backgroundElement.style.transition = `opacity 0.5s 0.5s`
    backgroundElement.style.opacity = 0
    imageElement.style.transition = `opacity 0.5s`
    imageElement.style.opacity = 1
    imageElement.removeEventListener(`load`, onImageLoad)
  }
  if (imageElement && backgroundElement) {
    if (imageElement.complete) {
      backgroundElement.style.opacity = 0
    } else {
      imageElement.style.opacity = 0
      imageElement.addEventListener(`load`, onImageLoad)
    }
  }
}
