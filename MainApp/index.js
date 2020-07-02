const express = require('express');
const bodyParser = require('body-parser');
const { Client } = require('pg');
const rp = require('request-promise');
const grpc = require('grpc');
const protoLoader = require('@grpc/proto-loader');
const { response } = require('express');

const authUrl = 'localhost:8082';

//gRPC settings
var PROTO_PATH = __dirname + '/test.proto';
var packageDefinition = protoLoader.loadSync(
  PROTO_PATH,
  {keepCase: true,
   longs: String,
   enums: String,
   defaults: true,
   oneofs: true
  });
var proto = grpc.loadPackageDefinition(packageDefinition);
var gRPCClient = new proto.Authentication(authUrl, grpc.credentials.createInsecure());

const app = express();
app.use(bodyParser.json());

var env = process.env.NODE_ENV || 'development';
var config = require('./config')[env];
 
//db connction
const client = new Client(config.database);
client.connect();
    
app.post('/signup', (req, res) => {
    var loginT=req.body.login;
    var passwordT=req.body.password;
    gRPCClient.signup({login: loginT, password: passwordT}, function(err, response) {
      if(err)
        res.status(400).send(err.details);
      else{
        res.status(200).send(response.message);
      }
    });
})

app.post('/signin', (req, res) => {
  var loginT=req.body.login;
  var passwordT=req.body.password;
  gRPCClient.signin({login: loginT, password: passwordT}, (err, response) => {
    if(err)
      res.status(400).send(err.details);
    else{
      res.status(200).send({session_key: response.session_key});
    }
  });
})

app.get('/getCategories', async (req, res) => {
  try{
    var categories = await client.query('SELECT * FROM "Category"');
    res.status(200).send(categories.rows);
  }catch(err){
    res.status(200).send({error: err.message});
  }
})

app.post('/createProduct', async (req, res) => {
  try{
    var category_id = req.body.category_id;
    var name = req.body.name;

    await client.query("INSERT INTO \"Product\" (name, category_id) VALUES ( $1, $2)", [name, category_id]);
    await client.query("UPDATE \"Category\" SET category_count = category_count + 1 WHERE id = $1", [category_id]);
    res.status(200).send("Inserted");
  }catch(err){
    res.status(400).send({error: err.message});
  }
})

app.post('/deleteProduct', async (req, res) => {
  try{
    var id = req.body.id;
    var category_id;

    var product = await client.query("SELECT * FROM \"Product\" WHERE id = $1", [id]);
    if(product.rows.length == 0){
      throw new Error('Product Not Found');
    }
    category_id = product.rows[0].category_id;

    await client.query("DELETE FROM \"Favorite\" WHERE product_id = $1", [id]);
    await client.query("DELETE FROM \"Product\" WHERE id = $1", [id]);
    await client.query("UPDATE \"Category\" SET  category_count =  category_count - 1 WHERE id = $1", [category_id]);
    res.status(200).send("Product Deleted");
  }catch(err){
    res.status(400).send({error: err.message});
  }
})

app.get('/getProducts', async (req, res) => {
  try{
    var category_id = req.body.category_id;
    var productsList;
    if(category_id){
      var productsList = await client.query("SELECT * FROM \"Product\" WHERE category_id = $1",[req.body.category_id]);
    }else{
      var productsList = await client.query("SELECT * FROM \"Product\"");
    }
    res.status(200).send(productsList.rows);
  }catch(err){
    res.status(400).send({error: err.message});
  }
})

app.post('/addToFavorite', async (req, res) => {
  var product_id = req.body.product_id;
  var keyT = req.body.session_key;  
  return new Promise((resolve, reject) => {
    if(!product_id)
      reject({details: 'product_id is incorrect'});
    gRPCClient.checkSession({session_key: keyT}, (err, response) => {
      if(err){
        reject(err);
      }else{
        resolve(response);
      }
    });
  })
  .then(value => {
    return new Promise((resolve, reject) => {
      client.query("INSERT INTO \"Favorite\" (user_id, product_id) VALUES ($1, $2)", [value.user_id, product_id], (err, result) => {
        if(err)
          reject(err);
        else
          res.status(200).send({status: 'inserted'});
      });
    });
  })
  .catch(err => {
    res.status(400).send({error: err});
  });  
})

app.get('/getFavorites', (req, res) => {
  var keyT = req.body.session_key;

  return new Promise((resolve, reject) => {
    gRPCClient.checkSession({session_key: keyT}, (err, response) => {
      if(err){
        reject(err);
      }else{
        resolve(response);
      }
    });
  })
  .then(value => {
    return new Promise((resolve, reject) => {
      client.query("SELECT \"Product\".id, \"Product\".name" +
            " FROM \"Favorite\" "+
            " INNER JOIN \"Product\" ON \"Product\".id = \"Favorite\".product_id" +
            " INNER JOIN \"User\" ON \"User\".id = \"Favorite\".user_id "+
            " WHERE \"User\".id = $1",[value.user_id], (err, result) => {
        if(err)
          reject(err);
        else
          res.status(200).send(result.rows);
      });
    });
  })
  .catch(err => {
    res.status(400).send({error: err.details});
  });  
})

app.listen(config.server.port, function () {
    console.log('Server is running.. on Port '+ config.server.port);
});
