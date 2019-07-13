# Photo Gallery Subfolder Navigation

## Adobe Assignment by Will Monahan

This app has been deployed on Heroku and can be accessed [here](https://adobe-gallery.herokuapp.com/).

This private repository contains a version of the Dropbox photo gallery tutorial application (the original can be found [here](https://github.com/dropbox/nodegallerytutorial)) modified to allow for subfolder navigation. The original tutorial README can be found now at [tutorial.md](tutorial.md).

As a quick disclaimer, my auto-formatter, Prettier, made some aesthetic changes (mostly to do with spacing) to some of the code in files that I modified. As a result, some changes appear in the git commit that are purely aesthetic - I did my best to add comments and make clear which code I actually did add/modify myself, and this README is intended to help with that as well.

The majority of the substantial changes that I made were done in the [controller.js](controller.js) file, specifically in the `module.exports.gallery` and `listPathsAsync` functions.

### First attempt

My first attempt at a naive implementation of subfolder image viewing put all images, from all subfolders, in the main homepage gallery. To do this, I went into the `listPathsAsync` function and after filtering results for only images, I ran another filter for only folders. I then would recursively call `listPathsAsync` for each subfolder - because this function is async, it returns a promise, and I used `Promise.all` to await all of the subfolder requests. This yielded an array of arrays, each of which contained the images in the subfolders, which could then be concatenated onto the end of the existing results array before returning.

This solution was actually quite simple and elegant, but I realized that the intention of the original assignment was really more about implementing a proper subfolder navigation system, so I scrapped my original idea and moved on.

### Final implementation

In order to implement file navigation, I wanted users to be able to click into subfolders to view images in that folder, and be able to navigate back to parent folders. From a high level, this boils down to two main changes that needed to be implemented to make this work:

1. I needed to create hyperlinks for subfolders, so that the browser's URL would reflect the navigation in the file path appropriately
2. I needed to use the URL to make the appropriate request to the Dropbox API, and display the right file contents based on where the user is in the file tree

The first point was very straightforward to work out. From my previous implementation, I already had a filtered list of subfolders in a given folder - I removed all of my recursive/promise-related calls and just returned that list directly from `listPathsAsync`. Once returned to the gallery route-handler, I just needed pass the array to the Handlebars context when I render the template, which I do on line 36 of [controller.js](controller.js). I pass through a boolean value as well to tell the template if there are any subfolders based on the length of the subfolder list (a bit more about this below). I modified [the template](views/gallery.hbs) so that as long as there are subfolders (from the boolean) it renders a list of links to each subfolder's proper path.

For the second point, I removed the original root/home route-handler from both [index.js](routes/index.js) and from [controller.js](controller.js). I replaced it with the gallery route-handler, and in [index.js](routes/index.js) I put it below all of the auth-related routes, using a `'/*'` pattern to match the URL. This way, if we know it doesn't match any of our auth-related routes, it "falls through" to the gallery handler and we treat it as a file path.

In the gallery route handler, we use use `req.params[0]` to grab our file path (including an empty string for the root folder) which we then pass to our call to `getLinksAsync`. When we get the result back, we check to see if the folder has any subfolders OR images, and if not we render the "empty" template.

We check our path to see if we're at the root: if the path is an empty string, we're at the root. If we aren't at the root, we create a "Parent Folder" button by splitting the path by `/` and removing the last element. This "Parent Folder" link is treated as another subfolder, and added to the front of the subfolder list for simplicity in the template. It also helps decide whether we need to render the navigation menu.

I was a bit torn about whether to include the "Parent Folder" hyperlink. The browser back-button works fine for traversing back up the tree, but I decided to include it for cases where a user arrives directly at a subfolder link and needs to traverse back up.

That's it! I decided not to keep my implementation as simple as possible, and I'm happy with the solution that I came up with. Thanks!
