const crypto = require('crypto'),
  config = require('./config'),
  NodeCache = require('node-cache'),
  rp = require('request-promise');

var mycache = new NodeCache();

//steps 1,2,3
// this method handles any route that doesn't deal with auth, by which I mean it deals with all folder navigation
module.exports.gallery = async (req, res, next) => {
  let token = req.session.token;
  if (token) {
    try {
      // get the path from the url (the router pattern is '/*')
      const path = req.params[0];

      // call getLinksAsync using our path
      let result = await getLinksAsync(token, path);

      // we check if the photos+subfolder length is greater than zero (the folder is not empty)
      if (result.paths.length + result.subFolders.length) {
        // if the path has length, then it means we are NOT in the root folder
        // in this case, we create a link to go back up to the parent folder
        if (path.length) {
          // split the path by slash, and remove the last element
          const pathBack = path.split('/');
          pathBack.pop();

          // add the "go back" to the front of the subfolder list
          result.subFolders.unshift({
            name: 'go back',
            path_lower: '/' + pathBack.join('/'),
          });
        }

        res.render('gallery', {
          imgs: result.paths,
          hasSubs: !!result.subFolders.length, // we only have subfolders if the array has length (including go back)
          subs: result.subFolders,
          layout: false,
        });
      } else {
        //if no images (or subfolders), ask user to upload some
        res.render('empty', { layout: false });
      }
    } catch (error) {
      return next(new Error('Error getting images from Dropbox'));
    }
  } else {
    res.redirect('/login');
  }
};

//steps 4,5,6
module.exports.login = (req, res, next) => {
  //create a random state value
  let state = crypto.randomBytes(16).toString('hex');

  //Save state and temporarysession for 10 mins
  // mycache.set(state, "aTempSessionValue", 600);

  mycache.set(state, req.sessionID, 600);

  let dbxRedirect =
    config.DBX_OAUTH_DOMAIN +
    config.DBX_OAUTH_PATH +
    '?response_type=code&client_id=' +
    config.DBX_APP_KEY +
    '&redirect_uri=' +
    config.OAUTH_REDIRECT_URL +
    '&state=' +
    state;

  res.redirect(dbxRedirect);
};

//steps 8-12
module.exports.oauthredirect = async (req, res, next) => {
  if (req.query.error_description) {
    return next(new Error(req.query.error_description));
  }

  let state = req.query.state;

  //if(!mycache.get(state)){
  if (mycache.get(state) != req.sessionID) {
    return next(new Error('session expired or invalid state'));
  }

  //Exchange code for token
  if (req.query.code) {
    let options = {
      url: config.DBX_API_DOMAIN + config.DBX_TOKEN_PATH,
      //build query string
      qs: {
        code: req.query.code,
        grant_type: 'authorization_code',
        client_id: config.DBX_APP_KEY,
        client_secret: config.DBX_APP_SECRET,
        redirect_uri: config.OAUTH_REDIRECT_URL,
      },
      method: 'POST',
      json: true,
    };

    try {
      let response = await rp(options);

      //we will replace later cache with a proper storage
      //mycache.set("aTempTokenKey", response.access_token, 3600);
      await regenerateSessionAsync(req);
      req.session.token = response.access_token;

      res.redirect('/');
    } catch (error) {
      return next(new Error('error getting token. ' + error.message));
    }
  }
};

//Returns a promise that fulfills when a new session is created
function regenerateSessionAsync(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      err ? reject(err) : resolve();
    });
  });
}

module.exports.logout = async (req, res, next) => {
  try {
    await destroySessionAsync(req);
    res.redirect('/login');
  } catch (error) {
    return next(new Error('error logging out. ' + error.message));
  }
};

//Returns a promise that fulfills when a session is destroyed
function destroySessionAsync(req) {
  return new Promise(async (resolve, reject) => {
    try {
      //First ensure token gets revoked in Dropbox.com
      let options = {
        url: config.DBX_API_DOMAIN + config.DBX_TOKEN_REVOKE_PATH,
        headers: { Authorization: 'Bearer ' + req.session.token },
        method: 'POST',
      };
      let result = await rp(options);
    } catch (error) {
      reject(new Error('error destroying token. '));
    }

    //then destroy the session
    req.session.destroy((err) => {
      err ? reject(err) : resolve();
    });
  });
}

/*Gets temporary links for a set of files in the root folder of the app
It is a two step process:
1.  Get a list of all the paths of files in the folder
2.  Fetch a temporary link for each file in the folder */
async function getLinksAsync(token, path) {
  //List images from the root of the app folder
  // I had to modify this function call to include the path passed in
  let result = await listPathsAsync(token, path);

  //Get a temporary link for each of those paths returned
  let temporaryLinkResults = await getTemporaryLinksForPathsAsync(
    token,
    result.paths
  );

  //Construct a new array only with the link field
  var temporaryLinks = temporaryLinkResults.map(function(entry) {
    return entry.link;
  });

  result.paths = temporaryLinks;

  return result;
}

/*
Returns an object containing an array with the path_lower of each 
image file and if more files a cursor to continue */

// this is the folder where I did most of the work for getting/traversing the subfolders
async function listPathsAsync(token, path) {
  // if we're getting the root folder, we don't want a leading slash (we want path to be an empty string)
  // if we're getting a subfolder, we need to add a leading slash to the path
  path = path.length ? '/' + path : path;

  let options = {
    url: config.DBX_API_DOMAIN + config.DBX_LIST_FOLDER_PATH,
    headers: { Authorization: 'Bearer ' + token },
    method: 'POST',
    json: true,
    body: { path: path },
  };

  try {
    //Make request to Dropbox to get list of files
    let result = await rp(options);

    //Filter response to images only
    let entriesFiltered = result.entries.filter(function(entry) {
      return entry.path_lower.search(/\.(gif|jpg|jpeg|tiff|png)$/i) > -1;
    });

    //Get an array from the entries with only the path_lower fields
    var paths = entriesFiltered.map(function(entry) {
      return entry.path_lower;
    });

    // get the entries that refer to subfolders for our navigation system
    const subFolders = result.entries.filter(
      (entry) => entry['.tag'] == 'folder'
    );

    //return a cursor only if there are more files in the current folder
    let response = {};
    response.paths = paths;

    // include our array of subfolders as part of the response, even if it's empty
    response.subFolders = subFolders;

    if (result.hasmore) response.cursor = result.cursor;
    return response;
  } catch (error) {
    return next(new Error('error listing folder. ' + error.message));
  }
}

//Returns an array with temporary links from an array with file paths
function getTemporaryLinksForPathsAsync(token, paths) {
  var promises = [];
  let options = {
    url: config.DBX_API_DOMAIN + config.DBX_GET_TEMPORARY_LINK_PATH,
    headers: { Authorization: 'Bearer ' + token },
    method: 'POST',
    json: true,
  };

  //Create a promise for each path and push it to an array of promises
  paths.forEach((path_lower) => {
    options.body = { path: path_lower };
    promises.push(rp(options));
  });

  //returns a promise that fullfills once all the promises in the array complete or one fails
  return Promise.all(promises);
}
