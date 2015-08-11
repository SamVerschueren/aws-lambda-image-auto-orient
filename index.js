'use strict';

/**
 * This microservice generates a thumbnail when an image is uploaded to an S3 bucket.
 * 
 * @author Sam Verschueren      <sam.verschueren@gmail.com>
 * @since  11 Aug. 2015
 */

// module dependencies
var AWS = require('aws-sdk'),
    gm = require('gm').subClass({ imageMagick: true }),
    util = require('util'),
    Q = require('q');

// Create a new S3 object
var s3 = new AWS.S3();

// Only handle jpeg images
var WHITELIST = ['image/jpeg', 'image/jpg'];

/**
 * Main entrypoint of the service.
 * 
 * @param {object}  event       The data regarding the event.
 * @param {object}  context     The AWS Lambda execution context.
 */
exports.handler = function(event, context) {
    var bucket = event.Records[0].s3.bucket.name,
        source = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
    
    Q.fcall(function() {        
        // Retrieve the object
        return getObject({Bucket: bucket, Key: source});
    }).then(function(response) {
        if(WHITELIST.indexOf(response.ContentType) === -1) {
            // If the mimetype is not in the whitelist, throw an error
            throw new TypeError('We should only handle jpeg images.');
        }
        
        // Scale and crop the image
        return [response.ContentType, autoOrient(response.Body)];
    }).spread(function(contentType, buffer) {        
        // Overwrite the original file with the auto oriented file
        return putObject({Bucket: bucket, Key: source, Body: buffer, ContentType: contentType});
    }).then(function() {
        // Everything went well
        context.succeed();
    }).catch(function(err) {
        if(err instanceof TypeError) {
            // If the error is a type error, it means we don't have to handler the image so the function should succeed
            return context.succeed();
        }
        
        // Log the error
        console.error(err);
        
        // Let the function fail
        context.fail(err);  
    });
    
    function getObject(obj) {
        return Q.Promise(function(resolve, reject) {
            // Retrieve the object
            s3.getObject(obj, function(err, result) {
                if(err) {
                    // Reject because something went wrong
                    return reject(err);
                } 
                
                // We retrieved the object successfully
                resolve(result);
            });
        });
    };
    
    function putObject(obj) {
        return Q.Promise(function(resolve, reject) {
            // Retrieve the object
            s3.putObject(obj, function(err, result) {
                if(err) {
                    // Reject because something went wrong
                    return reject(err);
                }
                
                // We retrieved the object successfully
                resolve(result);
            });
        });
    };
    
    function autoOrient(img) {
        return Q.Promise(function(resolve, reject) {
            // Orient the image depending on EXIF data
            gm(img).autoOrient().toBuffer(function(err, buffer) {
                if(err) {
                    // Reject the promise if an error occurred
                    return reject(err);
                }
                
                // Resolve the buffer if everything went well
                resolve(buffer);
            });
        });
    }
};