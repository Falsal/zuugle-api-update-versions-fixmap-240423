import express from 'express';
let router = express.Router();
import knex from "../knex";
import {createImageFromMap, mergeGpxFilesToOne} from "../utils/gpx/gpxUtils";
import {convertNumToTime, minutesFromMoment} from "../utils/helper";
import moment from "moment";
import {tourPdf} from "../utils/pdf/tourPdf";
import {getHost, getWhereFromDomain, replaceFilePath, round, get_domain_country} from "../utils/utils";
import { convertDifficulty } from '../utils/dataConversion';
const fs = require('fs');
const path = require('path');

router.get('/', (req, res) => listWrapper(req, res));
router.get('/filter', (req, res) => filterWrapper(req, res));

router.get('/total', (req, res) => totalWrapper(req, res));
router.get('/gpx', (req, res) => gpxWrapper(req, res));
router.get('/:id/connections', (req, res) => connectionsWrapper(req, res));
router.get('/:id/connections-extended', (req, res) => connectionsExtendedWrapper(req, res));
router.get('/:id/pdf', (req, res) => tourPdfWrapper(req, res));
router.get('/:id/gpx', (req, res) => tourGpxWrapper(req, res));
router.get('/:id', (req, res) => getWrapper(req, res));

// description :
// This function queries the database for the total number of tours, total connections, total ranges, total cities, and total provider using the knex.raw method. It then returns a JSON response with the queried values. The function is used to handle requests to the endpoint /total. The total number is used in the Start page where total all available tours is mentioned in the header. 
const totalWrapper = async (req, res) => {
    // req && console.log("Request totalWrapper L25:");
    // req && console.log("req.body :", req.query);
    // req && req.params && console.log(req.query.params);
    const total = await knex.raw(`SELECT tours.value as tours, conn.value as connections, ranges.value AS ranges, cities.value AS cities, provider.value AS provider FROM kpi AS tours LEFT OUTER JOIN kpi AS conn ON conn.name='total_connections' LEFT OUTER JOIN kpi AS ranges ON ranges.name='total_ranges' LEFT OUTER JOIN kpi AS cities ON cities.name='total_cities' LEFT OUTER JOIN kpi AS provider ON provider.name='total_provider' WHERE tours.name='total_tours';`);
    res.status(200).json({success: true, total_tours: total.rows[0]['tours'], total_connections: total.rows[0]['connections'], total_ranges: total.rows[0]['ranges'], total_cities: total.rows[0]['cities'], total_provider: total.rows[0]['provider']});
}

//description
//The getWrapper function in tours.js is responsible for handling GET requests to retrieve information about a specific tour. It receives the request object and response object as parameters, extracts the city, id, and domain query parameters from the request, and uses the id parameter to query the tour table in the database using Knex. If the id exists, it then calls the prepareTourEntry function to prepare the tour entry with additional information (such as pricing and availability) and sends the entry as a JSON response. If the id doesn't exist, it sends a 404 error response.
const getWrapper = async (req, res) => {
    // req && console.log("Request / getWrapper L35 :");
    // req && console.log("req.body/ getWrapper L36 :", req.body);
    const city = req.query.city;
    const id = req.params.id;
    const domain = req.query.domain;

    if(!!!id){
        res.status(404).json({success: false});
    } else {
        let selects = ['id', 'url', 'provider', 'hashed_url', 'description', 'image_url', 'ascent', 'descent', 'difficulty', 'difficulty_orig' , 'duration', 'distance', 'title', 'type', 'children', 'number_of_days', 'traverse', 'country', 'state', 'range_slug', 'range', 'season', 'month_order', 'country_at', 'country_de', 'country_it', 'country_ch', 'country_si', 'country_fr', 'publishing_date', 'quality_rating', 'user_rating_avg', 'cities', 'cities_object'];
        let entry = await knex('tour').select(selects).where({id: id}).first();
        entry = await prepareTourEntry(entry, city, domain, true);
        res.status(200).json({success: true, tour: entry});
    }
}
//Brief Summery :
// listWrapper takes two parameters, req and res. Based on the properties of the req object, the function generates a query to a database (using the Knex.js library) and returns the results in the res object.
//Detailed summery:
//The function retrieves various parameters from the req object, including search, ranges, city, range, state, country, type, sort, page, domain, and provider. It also sets various variables based on these parameters, such as showRanges, map, useOrderBy, useLimit, and addDetails.
// The function then sets up a database query using the knex object, based on the various parameters passed in through the req object. It also sets up a count query to determine the total number of results. The where variable is used to build the query filter, based on the city, range, state, country, and type parameters. The whereRaw variable is used to specify a raw SQL query string that can be used to filter results based on more complex criteria.
// Finally, the function generates an orderBy clause for the query based on the sort parameter. This allows the user to specify the order in which the results are returned based on a variety of criteria. The listWrapper function then executes the query and returns the results in the res object.
const listWrapper = async (req, res) => {
    // console.log("tours L55: req.query at listWrapper  :" + JSON.stringify(req.query))
    // describe
    //extracting various query parameters from the request object using req.query method
    const search = req.query.search;
    const showRanges = !!req.query.ranges;
    const city = req.query.city;
    const range = req.query.range;
    const state = req.query.state;
    const country = req.query.country;
    const type = req.query.type;
    const orderId = req.query.sort;
    const page = req.query.page || 2;
    const domain = req.query.domain;
    const provider = req.query.provider;
    //describe
    // variables initialized depending on availability of 'map' in the request
    const map = req.query.map == "true";
    // let useOrderBy = !!!map;
    // let useLimit = !!!map;
    let useLimit = !!!map;
    if(!!!map) {
        useLimit = true;
    }else{
        useLimit = false;
    }
    // console.log("useLimit: tours /listWrapper :" + useLimit);
    let addDetails = !!!map;

    //describe:
    //construuct the array of selected columns within the table beforehand , the value of which is dependant on the value of the req.query.map.
    let selects = ['id', 'url', 'provider', 'hashed_url', 'description', 'image_url', 'ascent', 'descent', 'difficulty', 'difficulty_orig', 'duration', 'distance', 'title', 'type', 'children', 'number_of_days', 'traverse', 'country', 'state', 'range_slug', 'range', 'season', 'month_order', 'country_at', 'country_de', 'country_it', 'country_ch', 'country_si', 'country_fr', 'publishing_date', 'quality_rating', 'user_rating_avg', 'cities', 'cities_object'];

    if(!!map){
        selects = ['id', 'gpx_data', 'provider', 'hashed_url', 'title'];
    }
    //describe:
    //define the query using knex (table name is tour) and use the 'selects' array constructed above.
    let query = knex('tour').select(selects);
    let countQuery = knex('tour').count('id');

    //describe:
    // where variable at this line receives one of the 4 types of object values : {country_at: true}  variations: _de, _ch, _it
    //checking query parameters: city, range, state, country, type, and provider so we can add any necessary where conditions to the select statement.
    // where will be filled with the values of the following : range, state, country, type, and provider (all coming from the defined constants above) 
    let where = getWhereFromDomain(domain);

    //describe:
    //use a new variable whereRaw to define the where statments
    let whereRaw = null;
    
    /** city search */
    //describe: 
    //If the user has entered a value for city, the code sets the whereRaw variable to an SQL clause that searches for a JSONB array column called 'cities' that contains a JSON object with a property 'city_slug' matching the user input.
    if(!!city && city.length > 0){
        whereRaw = `cities @> '[{"city_slug": "${city}"}]'::jsonb`;
    }

    /** region search */
    //describe: 
    // The code sets the where object to filter results by the values entered for range, state, and country if they are present in the user input.   
    if(!!range && range.length > 0){
        where.range = range;
    }
    if(!!state && state.length > 0){
        where.state = state;
    }
    if(!!country && country.length > 0){
        where.country = country;
    }

    /** type search */
    //describe
    // The code sets the 'where' object to filter results by the 'type' value if it is present in the user input.
    if(!!type && type.length > 0){
        where.type = type;
    }

    /** provider search */
    //describe
    // The code sets the 'where' object to filter results by the 'type' value if it is present in the user input.
    if(!!provider && provider.length > 0){
        where.provider = provider;
    }
    // describe:
    // The next block of code builds an SQL query based on the user input and uses the where and whereRaw methods to add conditions to the query based on the user input. The query searches through the search_column for user input using the PostgreSQL ts_rank() and websearch_to_tsquery() functions. So called "Fulltext search"
    let order_by_rank = "";
    //describe:
    //If the user has entered a value for search, the code sets the '_search' variable to a sanitized and formatted version of the user input.
    try {
        /** fulltext search */
        // what is fulltext search ?: Full Text Searching (or just text search) provides the capability to identify natural-language documents that satisfy a query, and optionally to sort them by relevance to the query. The most common type of search is to find all documents containing given query terms and return them in order of their similarity to the query. source: https://www.postgresql.org/docs/current/textsearch-intro.html
        if(!!search && search.length > 0){
            let _search = search.trim().toLowerCase();
            //describe: 
            //If '_search' contains spaces, the if statment sets the 'order_by_rank' variable to an SQL clause that ranks results by the relevance of the user input to the search_column using the ts_rank() function, and sets the whereRaw variable to an SQL clause that searches the search_column for the user input using the websearch_to_tsquery() function.
            //else, '_search' contains NO spaces: the same is repeated but with additional modifiers
            if(_search.indexOf(' ') > 0){
                order_by_rank = `ts_rank(search_column, websearch_to_tsquery('german', '${_search}') ) DESC,`
                whereRaw = `${!!whereRaw ? whereRaw + " AND " : ""}search_column @@ websearch_to_tsquery('german', '${_search}')`
            }
            else {
                order_by_rank = `ts_rank(search_column, websearch_to_tsquery('german', '"${_search}" ${_search}:*') ) DESC,`
                whereRaw = `${!!whereRaw ? whereRaw + " AND " : ""}search_column @@ websearch_to_tsquery('german', '"${_search}" ${_search}:*')`
            }
        }
    } catch(e){
        console.error('error creating fulltext search: ', e);
    }
    //describe:
    //After building up the where and whereRaw conditions based on the user's search input, the next 2 if statments then checks if there are any conditions to be added to the query.
    // First, it checks if there are any conditions in the 'where' object, which was built up earlier in the code. If there are, it adds these conditions to the query object and to the countQuery object using the where method.
    // Next, it checks if there are any conditions in the whereRaw string. If there are, it adds these conditions to the query object and to the countQuery object using the andWhereRaw method.
    // These methods allow the conditions to be added to the SQL query that will be executed. By chaining the where and andWhereRaw methods onto the query and countQuery objects, the code is able to build up a complex SQL query with multiple conditions, based on the user's search input. 
    if(!!where && Object.keys(where).length > 0){
        query = query.where(where);
        countQuery = countQuery.where(where);
    }
    if(!!whereRaw && whereRaw.length > 0){
        query = query.andWhereRaw(whereRaw);
        countQuery = countQuery.andWhereRaw(whereRaw);
    }

    /** filter search */
    //describe:
    //The buildWhereFromFilter function takes the query parameters and creates a where clause for the query. The true flag passed as the third parameter indicates that the function should create an exact match on the field names, rather than a partial match. The resulting where clause is then added to both the main query and the countQuery.
    query = buildWhereFromFilter(req.query, query, true);
    countQuery = buildWhereFromFilter(req.query, countQuery);
    //describe:
    //if-else block checks for a specific orderId parameter, which is used to determine the order in which the results should be sorted. Depending on the value of orderId, the query is sorted using different fields and ordering directions. 
    // There are some special cases where additional ordering is done based on the city parameter, as well as conditions where the query is sorted based on a combination of different fields. Finally, a default sorting order is set if no orderId parameter is provided. 
    if(!!orderId && orderId == "bewertung"){
        query = query.orderBy("user_rating_avg", 'desc');

        if(!!req.query.city){
            query = query.orderByRaw(`${order_by_rank} '${search}') ) DESC, traverse DESC, FLOOR((cities_object->'${req.query.city}'->>'best_connection_duration')::int/30)*30 ASC`);
        }

    } else if(!!orderId && orderId == "tourdistanz"){
        query = query.orderBy("distance", 'asc');

        if(!!req.query.city){
            query = query.orderByRaw(`${order_by_rank} traverse DESC, FLOOR((cities_object->'${req.query.city}'->>'best_connection_duration')::int/30)*30 ASC`);
        }
    } else if(!!orderId && orderId == "tourdauer"){
        if(!!req.query.city){
            query = query.orderBy("number_of_days", 'asc').orderByRaw(`(cities_object->'${req.query.city}'->>'total_tour_duration')::float ASC`).orderByRaw(`${order_by_rank} traverse DESC, FLOOR((cities_object->'${req.query.city}'->>'best_connection_duration')::int/30)*30 ASC`);
        } else {
            query = query.orderBy("number_of_days", 'asc').query.orderBy("duration", 'asc');
        }

    } else if(!!orderId && orderId == "anfahrtszeit"){
        if(!!req.query.city){
            query = query.orderByRaw(`${order_by_rank} (cities_object->'${req.query.city}'->>'best_connection_duration')::int ASC`)
        } else {
            query = query.orderBy("best_connection_duration", 'desc');
        }

    } else if(!!orderId && orderId == "relevanz"){
        query = query.orderBy("month_order", 'asc');

        if(!!req.query.city){
            query = query.orderByRaw(`${order_by_rank} traverse DESC, FLOOR((cities_object->'${req.query.city}'->>'best_connection_duration')::int/30)*30 ASC`);
        }

    } else if(!!orderId){
        query = query.orderBy(orderId, 'desc');

        if(!!req.query.city){
            query = query.orderByRaw(`${order_by_rank} traverse DESC, FLOOR((cities_object->'${req.query.city}'->>'best_connection_duration')::int/30)*30 ASC`);
        }

    } else {
        query = query.orderBy("user_rating_avg", 'asc');

        if(!!req.query.city){
            query = query.orderByRaw(`${order_by_rank} traverse DESC, FLOOR((cities_object->'${req.query.city}'->>'best_connection_duration')::int/30)*30 ASC`);
        }
    }

    //describe:
    // After the sorting order is applied, the query is further ordered by ID % date_part('day', NOW() )::INTEGER ASC. This orders the results by the remainder of the ID when divided by the number of days since the epoch, effectively shuffling the results.
    query = query.orderByRaw(`ID % date_part('day', NOW() )::INTEGER ASC`);

    // console.log('query: ', query.toQuery());

    /** set limit to query */
    //describe :
    // a limit and offset are applied to the query if the useLimit flag is set to true. The query is then executed to get the result set, and a count is retrieved from the countQuery. The result and count are then returned.
    if(!!useLimit){
        // page? console.log("page at useLimit L233:",page) : console.log("page is falsy");
        query = query.limit(9).offset(9 * (page - 1));
    }

    let result = await query;
    let count = await countQuery.first();

    //describe:
    //This code first logs the search phrase and the number of results in a database table called logsearchphrase if a search was performed. It replaces any single quotes in the search parameter with double quotes, which is necessary to insert the search parameter into the SQL statement.
    try {
        // Jetzt loggen wir diese query noch schnell für später
        let searchparam = '';
        if (search !== undefined) { 
            searchparam = search.replace("'",'"'); 
            const sql = `INSERT INTO logsearchphrase(phrase, num_results, city_slug, menu_lang, country_code) VALUES('${searchparam}', ${count['count']}, '${req.query.city}', 'de', '${get_domain_country(domain)}');`;
            await knex.raw(sql);
        };
    } catch(e){
        console.error('error inserting into logsearchphrase: ', e);
    }
    //describe: 
    //this code maps over the query result and applies the function prepareTourEntry to each entry. The prepareTourEntry function returns a modified version of the entry that includes additional data and formatting. The function also sets the 'is_map_entry' property of the entry to true if map is truthy. The function uses Promise.all to wait for all promises returned by prepareTourEntry to resolve before returning the final result array.
    await Promise.all(result.map(entry => new Promise(async resolve => {
        entry = await prepareTourEntry(entry, city, domain, addDetails);
        entry.is_map_entry = !!map;
        resolve(entry);
    })));

    /** add ranges to result */
    //describe:
    //This code prepares the response to a HTTP request.
    //The ranges array is populated with data about the tours ranges. The showRanges variable is a boolean that is passed in the request to determine whether to return the ranges or not. If showRanges is true, then the code queries the database to get a list of the distinct ranges and their image urls. It then loops through the results to create an array of range objects containing the range name and the corresponding image URL. The code then queries the database to get all states of each range and adds them to the states array of each range object.
    let ranges = [];
    if(!!showRanges){
        //describe:
        //rangeQuery is a Knex.js QueryBuilder object, which is used to construct SQL queries programmatically.
        let rangeQuery = knex('tour').select(['month_order', 'range_slug']).distinct(['range']).where(getWhereFromDomain(domain));
        //describe:
        //query 'rangeQuery' is modified to restrict the selection to a particular city.
        //the whereRaw method is called with an SQL expression that checks if the cities column (which is a JSONB data type) contains a JSON object with a city_slug property equal to the city parameter value.
        if(!!city && city.length > 0){
            rangeQuery = rangeQuery.whereRaw(`cities @> '[{"city_slug": "${city}"}]'::jsonb`);
        }
        //describe:
        //query is modified to order the results by month_order in ascending order, and to limit the number of rows returned to 10.
        rangeQuery = rangeQuery.orderBy("month_order", 'asc').limit(10);
        //describe:
        //the query is executed by calling await on the rangeQuery object, which returns an array of objects representing the rows returned by the query.
        let rangeList = await rangeQuery;
        //describe:
        //a loop is performed over each object in rangeList. For each object, it is checked if both tour and tour.range properties are defined and truthy. If they are, it is checked if there is no object in the ranges array that has a range property equal to tour.range. If there isn't, a new object is constructed with a range property equal to tour.range, and an image_url property equal to a string constructed with the getHost function on the domain parameter, the "/public/range-image/" path, and the tour.range_slug value. The new object is then pushed onto the ranges array.
        rangeList.forEach(tour => {
            if(!!tour && !!tour.range){
                if(!!!ranges.find(r => r.range === tour.range)){
                    ranges.push({
                        range: tour.range,
                        image_url: `${getHost(domain)}/public/range-image/${tour.range_slug}.jpg`
                    });
                }
            }
        });
        //describe:
        //In summary, this block of code loops through each range object in the ranges array and retrieves a list of states associated with that range from the tour table, using Knex.js. It then adds a new states property to the range object, which contains the list of states.
        if(!!ranges){
            // describe:
            // For each object, a new query is created using the knex instance, with the following conditions:
            // The select method retrieves the state column from the tour table.
            // The where method is used to filter the results to only include tours where the range column matches the range property of the current object in the loop.
            // The whereNotNull method is used to exclude any tours where the state column is null.
            // The groupBy method is used to group the results by the state column.
            for(let i=0; i<ranges.length;i++){
                let r = ranges[i];
                let states = await knex('tour').select('state').where({range: r.range}).whereNotNull('state').groupBy('state');
                //describe:
                //Overall, this last line is used to extract the state values from the states array and assign them to the states property of each object in the ranges array.
                ranges[i].states = states.filter(s => !!s.state).map(s => s.state);
            }
        }
    }
    //describe:
    // The result array contains the list of tours returned from the database after executing the main query. This array is already looped through to transform each tour entry with additional data and metadata using the prepareTourEntry function. Finally, a JSON response is returned with success set to true, the tours array, the total count of tours returned by the main query, the current page, and the ranges array (if showRanges is true).
    res.status(200).json({success: true, tours: result, total: count['count'], page: page, ranges: ranges});
}

const filterWrapper = async (req, res) => {
    const search = req.query.search;
    const city = req.query.city;
    const range = req.query.range;
    const state = req.query.state;
    const type = req.query.type;
    const domain = req.query.domain;
    const country = req.query.country;
    const provider = req.query.provider;

    let query = knex('tour').select(['ascent', 'descent', 'difficulty', 'difficulty_orig', 'duration', 'distance', 'type', 'children', 'number_of_days', 'traverse', 'country', 'state', 'range_slug', 'range', 'season', 'month_order', 'quality_rating', 'user_rating_avg', 'cities', 'cities_object']);

    let where = getWhereFromDomain(domain);
    let whereRaw = null;

    /** city search */
    if(!!city && city.length > 0){
        whereRaw = `cities @> '[{"city_slug": "${city}"}]'::jsonb`;
    }

    /** region search */
    if(!!range && range.length > 0){
        where.range = range;
    }
    if(!!state && state.length > 0){
        where.state = state;
    }
    if(!!country && country.length > 0){
        where.country = country;
    }

    /** type search */
    if(!!type && type.length > 0){
        where.type = type;
    }

    /** provider search */
    if(!!provider && provider.length > 0){
        where.provider = provider;
    }

    try {
        /** fulltext search */
        if(!!search && search.length > 0){
            let _search = search.trim().toLowerCase();
            if(_search.indexOf(' ') > 0){
                whereRaw = `${!!whereRaw ? whereRaw + " AND " : ""}search_column @@ websearch_to_tsquery('german', '${_search}')`
            }
            else {
                whereRaw = `${!!whereRaw ? whereRaw + " AND " : ""}search_column @@ websearch_to_tsquery('german', '"${_search}" ${_search}:*')`
            }
        }
    } catch(e){
        console.error('error creating fulltext search: ', e);
    }

    if(!!where && Object.keys(where).length > 0){
        query = query.where(where);
    }
    if(!!whereRaw && whereRaw.length > 0){
        query = query.andWhereRaw(whereRaw);
    }

    /** filter search */
    let queryForFilter = query.clone();

    /** load full result for filter */
    let filterResultList = await queryForFilter;

    res.status(200).json({success: true, filter: buildFilterResult(filterResultList, city, req.query)});
}


// const getNextConnectionFromTour = async (tour, city, datum) => {
//    const connections = await knex('fahrplan').select().where({hashed_url: tour.hashed_url, tour_provider: tour.provider, city_slug: city});
// }

const connectionsWrapper = async (req, res) => {
    const id = req.params.id;
    const city = req.query.city;
    const domain = req.query.domain;

    const weekday = getWeekday(moment());
    const tour = await knex('tour').select().where({id: id}).first();
    if(!!!tour || !!!city){
        res.status(404).json({success: false});
        return;
    }

    const query_con = knex('fahrplan').select().where({hashed_url: tour.hashed_url, tour_provider: tour.provider, city_slug: city});
    /*
    if(process.env.NODE_ENV != "production"){
        console.log('query in connectionsWrapper: ', query_con.toQuery());
    }
    */
    const connections = await query_con;
    let missing_days = getMissingConnectionDays(connections);
    await Promise.all(connections.map(connection => new Promise(resolve => {
        connection.best_connection_duration_minutes = minutesFromMoment(moment(connection.best_connection_duration, 'HH:mm:ss'));
        connection.connection_duration_minutes = minutesFromMoment(moment(connection.connection_duration, 'HH:mm:ss'));
        connection.return_duration_minutes = minutesFromMoment(moment(connection.return_duration, 'HH:mm:ss'));
        connection.missing_days = missing_days;
        /* connection.connection_arrival_stop = connection_arrival_stop;
        connection.connection_returns_departure_stop = connection_returns_departure_stop; */
        resolve(connection);
    })));


    let filteredConnections = [];
    connections.forEach(t => {
        if(!!!filteredConnections.find(tt => compareConnections(t, tt))){
            t = mapConnectionToFrontend(t)

            filteredConnections.push(t);
        }
    })

    let filteredReturns = [];
    getConnectionsByWeekday(connections, weekday).forEach(t => {
        /** Die Rückreisen werden nach aktuellem Tag gefiltert -> kann man machen, muss man aber nicht. Wenn nicht gefiltert, werden alle Rückreisen für alle Wochentage angezeigt, was eine falsche Anzahl an Rückreisen ausgibt */
        if(!!!filteredReturns.find(tt => compareConnectionReturns(t, tt))){
            t = mapConnectionReturnToFrontend(t)
            t.gpx_file = `${getHost(domain)}/public/gpx-track/fromtour_track_${t.fromtour_track_key}.gpx`;

            filteredReturns.push(t);
        }
    })

    filteredReturns.sort(function(x, y){
        return moment(x.return_departure_datetime).unix() - moment(y.return_departure_datetime).unix();
    })

    res.status(200).json({success: true, connections: filteredConnections, returns: filteredReturns});
}

const connectionsExtendedWrapper = async (req, res) => {
    const id = req.params.id;
    const city = req.query.city;
    const domain = req.query.domain;

    const tour = await knex('tour').select().where({id: id}).first();
    if(!!!tour || !!!city){
        res.status(404).json({success: false});
        return;
    }

    const connections = await knex('fahrplan').select().where({hashed_url: tour.hashed_url, tour_provider: tour.provider, city_slug: city}).orderBy('return_row', 'asc');

    const today = moment().set('hour', 0).set('minute', 0).set('second', 0);
    let end = moment().add(7, 'day');

    let result = [];

    while(today.isBefore(end)){
        const byWeekday  = connections.filter(conn => moment(conn.calendar_date).format('DD.MM.YYYY') == today.format('DD.MM.YYYY'))
        const duplicatesRemoved = [];

        byWeekday.forEach(t => {
            let e = {...t}
            e.connection_duration_minutes = minutesFromMoment(moment(e.connection_duration, 'HH:mm:ss'));
            e.return_duration_minutes = minutesFromMoment(moment(e.return_duration, 'HH:mm:ss'));
            e.connection_departure_datetime_entry = setMomentToSpecificDate(e.connection_departure_datetime, today.format());

            if(!!!duplicatesRemoved.find(tt => compareConnections(e, tt)) && moment(e.valid_thru).isSameOrAfter(today)){
                e = mapConnectionToFrontend(e, today.format());
                e.gpx_file = `${getHost(domain)}/public/gpx-track/totour_track_${e.totour_track_key}.gpx`;
                duplicatesRemoved.push(e);
            }
        })

        result.push({
            date: today.format(),
            connections: duplicatesRemoved,
            returns: getReturnConnectionsByConnection(tour, connections, domain, today),
        })
        today.add(1, "day");
    }

    //handle last value
    if(result && result.length > 0){
        if(!!result[result.length - 1] && (!!!result[result.length - 1].connections || result[result.length - 1].connections.length == 0)){
            result = result.slice(0, -1);
        }
    }

    res.status(200).json({success: true, result: result});
}

const getReturnConnectionsByConnection = (tour, connections, domain, today) => {
    let _connections = [];
    let _duplicatesRemoved = [];

    /*if(!!tour.number_of_days && tour.number_of_days > 1){
        let nextDay = today.clone();
        nextDay.add(tour.number_of_days - 1, 'days');
        _connections = connections.filter(conn => moment(conn.calendar_date).format('DD.MM.YYYY') == nextDay.format('DD.MM.YYYY'))
    } else {
        _connections = connections.filter(conn => moment(conn.calendar_date).format('DD.MM.YYYY') == today.format('DD.MM.YYYY'))
    }*/
    _connections = connections.filter(conn => moment(conn.calendar_date).format('DD.MM.YYYY') == today.format('DD.MM.YYYY'))


    //filter and map
    _connections.forEach(t => {
        let e = {...t}
        e.connection_duration_minutes = minutesFromMoment(moment(e.connection_duration, 'HH:mm:ss'));
        e.return_duration_minutes = minutesFromMoment(moment(e.return_duration, 'HH:mm:ss'));

        if(!!!_duplicatesRemoved.find(tt => compareConnectionReturns(e, tt)) && moment(e.valid_thru).isSameOrAfter(today)){
            e = mapConnectionToFrontend(e, today.format())
            e.gpx_file = `${getHost(domain)}/public/gpx-track/fromtour_track_${e.fromtour_track_key}.gpx`;
            _duplicatesRemoved.push(e);
        }
    });
    return _duplicatesRemoved;
}

const gpxWrapper = async (req, res) => {
    createImageFromMap();
    res.status(200).json({success: true });
}

const mapConnectionToFrontend = (connection) => {
    if(!!!connection){
        return connection;
    }
    let durationFormatted = convertNumToTime(connection.connection_duration_minutes / 60);
    connection.connection_departure_arrival_datetime_string = `${moment(connection.connection_departure_datetime).format('DD.MM. HH:mm')}-${moment(connection.connection_arrival_datetime).format('HH:mm')} (${durationFormatted})`;

    connection.connection_description_parsed = parseConnectionDescription(connection);
    connection.return_description_parsed = parseReturnConnectionDescription(connection);

    return connection;
}

const mapConnectionReturnToFrontend = (connection) => {
    if(!!!connection){
        return connection;
    }

    let durationFormatted = convertNumToTime(connection.return_duration_minutes / 60);
    connection.return_departure_arrival_datetime_string = `${moment(connection.return_departure_datetime).format('DD.MM. HH:mm')}-${moment(connection.return_arrival_datetime).format('HH:mm')} (${durationFormatted})`;
    connection.return_description_parsed = parseReturnConnectionDescription(connection);

    return connection;
}

const setMomentToCurrentDate = (date) => {
    let mom = moment(date);
    let today = moment();

    today.set("hour", mom.get("hour"));
    today.set("minute", mom.get("minute"));
    today.set("second", mom.get("second"));

    return today.format();
}

const setMomentToSpecificDate = (date, _input) => {
    let mom = moment(date);
    let input = moment(_input);
    mom.set("date", input.get("date"));
    mom.set("month", input.get("month"));
    mom.set("year", input.get("year"));
    return mom.format();
}

const compareConnections = (trans1, trans2) => {
    return trans1 != null
        && trans2 != null
        && moment(trans1.connection_departure_datetime).isSame(moment(trans2.connection_departure_datetime))
        && moment(trans1.connection_arrival_datetime).isSame(moment(trans2.connection_arrival_datetime))
        && trans1.connection_departure_stop == trans2.connection_departure_stop
        && trans1.connection_rank == trans2.connection_rank;
}

const compareConnectionReturns = (conn1, conn2) => {
    return conn1 != null
        && conn2 != null
        && moment(conn1.return_departure_datetime).format('HH:mm:ss') == moment(conn2.return_departure_datetime).format('HH:mm:ss')
        && moment(conn1.return_arrival_datetime).format("HH:mm:ss") == moment(conn2.return_arrival_datetime).format("HH:mm:ss")
        && conn1.return_arrival_stop == conn2.return_arrival_stop;
}

const getWeekdayType = (date) => {
    const day = moment(date).day();
    if(day == 6){
        return "saturday";
    } else if(day == 0){
        return "sunday";
    } else {
        return "businessday";
    }
}

const getWeekday = (date) => {
    const day = moment(date).day();
    switch(day){
        case 0: return "sun";
        case 1: return "mon";
        case 2: return "tue";
        case 3: return "wed";
        case 4: return "thu";
        case 5: return "fri";
        case 6: return "sat";
        default: return "mon";
    }
}

const parseConnectionDescription = (connection) => {
    if(!!connection && !!connection.connection_description_detail){
        let splitted = connection.connection_description_detail.split('|');
        return splitted;
    }
    return [];
}

const parseReturnConnectionDescription = (connection) => {
    if(!!connection && !!connection.return_description_detail){
        let splitted = connection.return_description_detail.split('|');
        return splitted;
    }
    return [];
}

const buildFilterResult = (result, city, params) => {

    let types = [];
    let ranges = [];
    let isSingleDayTourPossible = false;
    let isMultipleDayTourPossible = false;
    let isSummerTourPossible = false;
    let isWinterTourPossible = false;
    let maxAscent = 0;
    let maxDescent = 0;
    let minAscent = 10000;
    let minDescent = 10000;
    let maxDistance = 0;
    let minDistance = 10000;
    let isChildrenPossible = false;
    let isTraversePossible = false;
    let minTransportDuration = 10000;
    let maxTransportDuration = 0;

    result.forEach(tour => {

        if(!!!tour.type){
            tour.type = "Keine Angabe"
        }
        if(!!!tour.range){
            tour.range = "Keine Angabe"
        }
        if(!!tour.type && !!!types.find(t => tour.type === t)){
            types.push(tour.type);
        }
        if(!!tour.range && !!!ranges.find(t => tour.range === t)){
            ranges.push(tour.range);
        }
        if(!!!isSingleDayTourPossible && tour.number_of_days == 1){
            isSingleDayTourPossible = true;
        } else if(!!!isMultipleDayTourPossible && tour.number_of_days > 1){
            isMultipleDayTourPossible = true;
        }

        if(!!!isSummerTourPossible && (tour.season == "s" || tour.season == "n") ){
            isSummerTourPossible = true;
        }
        if(!!!isWinterTourPossible && (tour.season == "w" || tour.season == "n") ){
            isWinterTourPossible = true;
        }

        if(tour.ascent > maxAscent){
            maxAscent = tour.ascent;
        }

        if(tour.ascent < minAscent){
            minAscent = tour.ascent;
        }

        if(tour.descent > maxDescent){
            maxDescent = tour.descent;
        }

        if(tour.descent < minDescent){
            minDescent = tour.descent;
        }

        if(parseFloat(tour.distance) > maxDistance){
            maxDistance = parseFloat(tour.distance);
        }

        if(parseFloat(tour.distance) < minDistance){
            minDistance = parseFloat(tour.distance);
        }

        if(!!!isChildrenPossible && (tour.children == 1) ){
            isChildrenPossible = true;
        }
        if(!!!isTraversePossible && (tour.traverse == 1) ){
            isTraversePossible = true;
        }

        if(maxAscent > 3000){
            maxAscent = 3000;
        }
        if(maxDescent > 3000){
            maxDescent = 3000;
        }

        if(maxDistance > 80){
            maxDistance = 80;
        }

        if(tour.cities && !!city){
            const _city = tour.cities.find(c => c.city_slug == city);

            if(!!_city && !!_city.best_connection_duration){
                if(parseFloat(_city.best_connection_duration) > maxTransportDuration){
                    maxTransportDuration = parseFloat(_city.best_connection_duration);
                }
                if(parseFloat(_city.best_connection_duration) < minTransportDuration){
                    minTransportDuration = parseFloat(_city.best_connection_duration);
                }
            }
        }

    });

    if(!!types){
        types.sort();
    }

    if(!!ranges){
        ranges.sort();
    }

    return {
        types,
        ranges,
        isSingleDayTourPossible,
        isMultipleDayTourPossible,
        isSummerTourPossible,
        isWinterTourPossible,
        maxAscent,
        minAscent,
        maxDescent,
        minDescent,
        maxDistance,
        minDistance,
        isChildrenPossible,
        isTraversePossible,
        minTransportDuration: round((minTransportDuration / 60), 2),
        maxTransportDuration: round((maxTransportDuration / 60), 2)
    };
}

const buildWhereFromFilter = (params, query, print = false) => {
  try {

    // clg
    // console.log('params : ')
    // console.log(params)
    if(params.filter){
        //clg
        // console.log("L774 params.singleDayTour :", params.filter.singleDayTour);     
        // console.log("L774 params.multipleDayTour :", params.filter.multipleDayTour);     
        // console.log("L774 params.children :", params.filter.children);     
        // console.log("L774 params.traverse :", params.filter.traverse);     
    }
    // console.log("L775 query :", query);     
    
    if(!!!params.filter ) return query;
    
    // Description:
    // check if params.filter contains ONLY a key/value pair {ignore_filter : 'true'}
    let filterIgnored = Object.keys(params.filter).length === 1 && params.filter['ignore_filter'] === 'true'
    //clg:
        // console.log("L786: filterIgnored :", filterIgnored)

    if(filterIgnored ) return query;


    // !!query && console.log("L787 query still with us not returned yet")
    console.log("L787 query still with us not returned yet")

    let filter ;
    if(typeof(params.filter) === 'string') {
        filter = JSON.parse(params.filter) ;
        // console.log('Filter is string : ')
        // console.log(filter)
    }else if(typeof(params.filter) === 'object'){
        filter = params.filter;
        // console.log('Filter is object : ')
        // console.log(filter)
    }else{
        filter={};
    }


    const {
      singleDayTour,
      multipleDayTour,
      summerSeason,
      winterSeason,
      children,
      traverse,
      difficulty,
      minAscent,
      maxAscent,
      minDescent,
      maxDescent,
      minTransportDuration,
      maxTransportDuration,
      minDistance,
      maxDistance,
      ranges,
      types,
    } = filter;

    /** Wintertour oder Sommertour, Ganzjahrestour oder Nicht zutreffend*/
    if(!!parseTrueFalseQueryParam(summerSeason) && !!parseTrueFalseQueryParam(winterSeason)){
        //query = query.whereIn('season', ['g', 's', 'w']);
    } else if(!!parseTrueFalseQueryParam(summerSeason)){
        query = query.whereIn('season', ['g', 's']);
    } else if(!!parseTrueFalseQueryParam(winterSeason)){
        query = query.whereIn('season', ['g', 'w']);
    } else if(summerSeason === false && winterSeason === false){
        query = query.whereIn('season', ['x']);
    }

    /** Eintagestouren bzw. Mehrtagestouren */
    if(!!parseTrueFalseQueryParam(singleDayTour) && !!parseTrueFalseQueryParam(multipleDayTour)){

    } else if(!!parseTrueFalseQueryParam(singleDayTour)){
        query = query.where({number_of_days: 1})
    } else if(!!parseTrueFalseQueryParam(multipleDayTour)){
        query = query.whereRaw('number_of_days > 1')
    } else if(singleDayTour === false && multipleDayTour === false){
        query = query.whereRaw('number_of_days = -1')
    }

    /** Kinderfreundlich */
    if(!!parseTrueFalseQueryParam(children)){
        query = query.where({children: 1})
    }

    /** Überschreitung */
    if (!!parseTrueFalseQueryParam(traverse)) {
        let val=0;
        val = traverse == true ? 1 : 0 ;
        // console.log('Traverse/ val ', traverse, val)
      query = query.where({ traverse: val });
    }

    /** Aufstieg, Abstieg */
    if(!!minAscent){
        query = query.whereRaw('ascent >= ' + minAscent);
    }
    if(!!maxAscent){
        let _ascent = maxAscent;
        if(_ascent == 3000){
            _ascent = 100000;
        }
        query = query.whereRaw('ascent <= ' + _ascent);
    }

    if(!!minDescent){
        query = query.whereRaw('descent >= ' + minDescent);
    }
    if(!!maxDescent){
        let _ascent = maxDescent;
        if(_ascent == 3000){
            _ascent = 100000;
        }
        query = query.whereRaw('descent <= ' + _ascent);
    }

    /** distanz */
    if(!!minDistance){
        query = query.whereRaw('distance >= ' + minDistance);
    }
    if(!!maxDistance){
       let _distance = maxDistance;
        if(_distance == 80){
            _distance = 1000;
        }
        query = query.whereRaw('distance <= ' + _distance);
    }

    /** schwierigkeit */
    if (!!difficulty) {
      query = query.whereRaw("difficulty <= " + difficulty);
    }

    if (!!ranges) {
        let newRanges;
        if(typeof(ranges) == "object" && !Array.isArray(ranges))  { 
            newRanges = Object.values(ranges)
            // console.log("ranges L913:", newRanges)
        }else{
            newRanges = ranges;
        }

      const nullEntry = newRanges.find((r) => r == "Keine Angabe");
    //   console.log("nullEntry:", nullEntry)
      let _ranges = newRanges.map((r) => "'" + r + "'");
      if (!!nullEntry) {
        query = query.whereRaw(
          `(range in (${_ranges}) OR range IS NULL OR range = '')`
        );
      } else {
        query = query.whereRaw(`(range in (${_ranges}))`);
      }
    }

    if(!!types){
        const nullEntry = types.find(r => r == "Keine Angabe");
        let _types = types.map(r => '\'' + r + '\'');
        if(!!nullEntry){
            query = query.whereRaw(`(type in (${_types}) OR type IS NULL OR type = '')`);
        } else {
            query = query.whereRaw(`(type in (${_types}))`);
        }
    }

    /** Anfahrtszeit */
    if(!!minTransportDuration && !!params.city){
        let transportDurationMin = minTransportDuration * 60;
        query = query.whereRaw(`(cities_object->'${params.city}'->>'best_connection_duration')::int >= ${transportDurationMin}`)
    }

    if(!!maxTransportDuration && !!params.city){
        let transportDurationMin = maxTransportDuration * 60;
        query = query.whereRaw(`(cities_object->'${params.city}'->>'best_connection_duration')::int <= ${transportDurationMin}`)
    }
  } catch (error) {
    console.log("error :", error.message);
  }
//   console.log("returned query values:", query);
//         console.log(query.toSQL().sql)
        // const { sql, bindings } = query.toSQL();
        // console.log(sql, bindings);

  return query;
};

const parseTrueFalseQueryParam = (param) => {
    return !!param;
}

const tourPdfWrapper = async (req, res) => {
    const id = req.params.id;
    const city = req.query.city;
    const datum = !!req.query.datum ? req.query.datum : moment().format();
    const connectionId = req.query.connection_id;
    const connectionReturnId = req.query.connection_return_id;
    const connectionReturnIds = req.query.connection_return_ids;

    const tour = await knex('tour').select().where({id: id}).first();
    let connection, connectionReturn, connectionReturns = null;

    if(!!connectionId){
        connection = await knex('fahrplan').select().where({id: connectionId}).first();
    }

    if(!!connectionReturnId){
        connectionReturn = await knex('fahrplan').select().where({id: connectionReturnId}).first();
    }

    if(!!connectionReturnIds){
        connectionReturns = await knex('fahrplan').select().whereIn('id', connectionReturnIds).orderBy('return_row', 'asc');
        if(!!connectionReturns){
            connectionReturns = connectionReturns.map(e => {
                e.return_duration_minutes = minutesFromMoment(moment(e.return_duration, 'HH:mm:ss'));
                return mapConnectionReturnToFrontend(e, datum);
            })
        }
    }

    if(!!connection){
        connection.connection_duration_minutes = minutesFromMoment(moment(connection.connection_duration, 'HH:mm:ss'));
    }
    if(!!connectionReturn){
        connectionReturn.return_duration_minutes = minutesFromMoment(moment(connectionReturn.return_duration, 'HH:mm:ss'));
    }

    if(!!tour){
        const pdf = await tourPdf({tour, connection: mapConnectionToFrontend(connection, datum), connectionReturn: mapConnectionReturnToFrontend(connectionReturn, datum), datum, connectionReturns});
        // console.log("L1019 tours /tourPdfWrapper / pdf value :", !!pdf); // value : true
        if(!!pdf){
            // console.log("L1022 tours.js : fileName passed to tourPdfWrapper : ", "Zuugle_" + tour.title.replace(/ /g, '') + ".pdf")
            res.status(200).json({ success: true, pdf: pdf, fileName: "Zuugle_" + tour.title.replace(/ /g, '') + ".pdf" });
            return;
        }
    }
    res.status(500).json({ success: false });
}

const tourGpxWrapper = async (req, res) => {
    const id = req.params.id;
    const type = !!req.query.type ? req.query.type : "gpx";
    const key = req.query.key;
    const keyAnreise = req.query.key_anreise;
    const keyAbreise = req.query.key_abreise;

    const entry = await knex('tour').select(['provider', 'hashed_url']).where({id: id}).first();
    res.setHeader('content-type', 'application/gpx+xml');
    res.setHeader('Cache-Control', 'public, max-age=31557600');

    try {
        let BASE_PATH = process.env.NODE_ENV === "production" ? "../" : "../../";
        if(type == "all"){
            let filePathMain = replaceFilePath(path.join(__dirname, BASE_PATH, `/public/gpx/${entry.provider}_${entry.hashed_url}.gpx`));
            let filePathAbreise = replaceFilePath(path.join(__dirname, BASE_PATH, `/public/gpx-track/fromtour_track_${keyAbreise}.gpx`));
            let filePathAnreise = replaceFilePath(path.join(__dirname, BASE_PATH, `/public/gpx-track/totour_track_${keyAnreise}.gpx`));

            const xml = await mergeGpxFilesToOne(filePathMain, filePathAnreise, filePathAbreise);
            if(!!xml){
                res.status(200).send(xml);
            } else {
                res.status(400).json({success: false});
            }

        } else {
            let filePath = path.join(__dirname, BASE_PATH, `/public/gpx/${entry.provider}_${entry.hashed_url}.gpx`);
            if(type == "abreise" && !!key){
                filePath = path.join(__dirname, BASE_PATH, `/public/gpx-track/fromtour_track_${key}.gpx`);
            } else if(type == "anreise" && !!key){
                filePath = path.join(__dirname, BASE_PATH, `/public/gpx-track/totour_track_${key}.gpx`);
            }
            filePath = replaceFilePath(filePath);

            let stream = fs.createReadStream(filePath);
            stream.on('error', error => {
                console.log('error: ', error);
                res.status(500).json({ success: false });
            });
            stream.on('open', () => stream.pipe(res));
        }
    } catch(e){
        console.error(e);
    }
}

const getMissingConnectionDays = (connections) => {
    let toReturn = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    if(!!connections && connections.length > 0){
        if(!!connections.find(c => c.weekday === "sun")){
            toReturn = toReturn.filter(c => c !== "So");
        }
        if(!!connections.find(c => c.weekday === "mon")){
            toReturn = toReturn.filter(c => c !== "Mo");
        }
        if(!!connections.find(c => c.weekday === "tue")){
            toReturn = toReturn.filter(c => c !== "Di");
        }
        if(!!connections.find(c => c.weekday === "wed")){
            toReturn = toReturn.filter(c => c !== "Mi");
        }
        if(!!connections.find(c => c.weekday === "thu")){
            toReturn = toReturn.filter(c => c !== "Do");
        }
        if(!!connections.find(c => c.weekday === "fri")){
            toReturn = toReturn.filter(c => c !== "Fr");
        }
        if(!!connections.find(c => c.weekday === "sat")){
            toReturn = toReturn.filter(c => c !== "Sa");
        }
    }
    return toReturn;
}

const getConnectionsByWeekday = (connections, weekday) => {
    if(!!connections && connections.length > 0){
        const found = connections.filter(c => c.weekday === weekday);
        if(!!found && found.length > 0){
            return found;
        } else {
            return getConnectionsByWeekday(connections, connections[0].weekday);
        }
    }
    return [];
}

const prepareTourEntry = async (entry, city, domain, addDetails = true) => {
    entry.gpx_file = `${getHost(domain)}/public/gpx/${entry.provider}_${entry.hashed_url}.gpx`;
    entry.gpx_image_file = `${getHost(domain)}/public/gpx-image/${entry.provider}_${entry.hashed_url}_gpx.jpg`;
    entry.gpx_image_file_small = `${getHost(domain)}/public/gpx-image/${entry.provider}_${entry.hashed_url}_gpx_small.jpg`;
    if(!!addDetails){
        if(!!city && !!entry.cities_object[city] && !!entry.cities_object[city].total_tour_duration){
            entry.total_tour_duration = entry.cities_object[city].total_tour_duration
        } else {
            entry.total_tour_duration = entry.duration;
        }

        if(!!city){
            // !!domain && console.log("tours.js L1046, domain:",domain);
            const toTour = await knex('fahrplan').select('totour_track_key').where({hashed_url: entry.hashed_url, tour_provider: entry.provider, city_slug: city}).whereNotNull('totour_track_key').first();
            const fromTour = await knex('fahrplan').select('fromtour_track_key').where({hashed_url: entry.hashed_url, tour_provider: entry.provider, city_slug: city}).whereNotNull('fromtour_track_key').first();

            if(!!toTour && !!toTour.totour_track_key){
                entry.totour_gpx_file = `${getHost(domain)}/public/gpx-track/totour_track_${toTour.totour_track_key}.gpx`;
            }
            if(!!fromTour && !!fromTour.fromtour_track_key){
                entry.fromtour_gpx_file = `${getHost(domain)}/public/gpx-track/fromtour_track_${fromTour.fromtour_track_key}.gpx`;
            }
        }

        /** add provider_name to result */
        let provider_result = await knex('provider').select('provider_name').where({provider: entry.provider}).first();
        entry.provider_name = provider_result.provider_name;

        // convert the "difficulty" value into a text value 
        entry.difficulty = convertDifficulty(entry.difficulty)
        
        // console.log('entry.difficulty value :',entry.difficulty);
    }
    return entry;
}

export default router;